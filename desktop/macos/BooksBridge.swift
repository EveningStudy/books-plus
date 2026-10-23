// Books+ native bridge. Apple databases are opened READONLY, then backed up to memory.
// Port of books-icloud-exporter records/common discovery and snapshot semantics.
import Foundation
import AppKit
import CoreServices
import SQLite3
import Darwin

let fm = FileManager.default
let home = fm.homeDirectoryForCurrentUser
let data = home.appendingPathComponent("Library/Containers/com.apple.iBooksX/Data")
let shared = home.appendingPathComponent("Library/Group Containers/group.com.apple.iBooks")
let cloud = home.appendingPathComponent("Library/Mobile Documents/iCloud~com~apple~iBooks/Documents")
func emit(_ value: Any) {
    if let bytes = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let s = String(data: bytes, encoding: .utf8) {
        print(s); fflush(stdout)
    }
}
func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(1) }
func query(_ db: OpaquePointer?, _ sql: String) throws -> [[String: Any]] {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw NSError(domain: String(cString: sqlite3_errmsg(db)), code: 1) }
    defer { sqlite3_finalize(stmt) }
    var rows = [[String: Any]]()
    while true {
        let step = sqlite3_step(stmt)
        if step == SQLITE_DONE { break }
        guard step == SQLITE_ROW else { throw NSError(domain: String(cString: sqlite3_errmsg(db)), code: 2) }
        var row = [String: Any]()
        for i in 0..<sqlite3_column_count(stmt) {
            let key = String(cString: sqlite3_column_name(stmt, i))
            switch sqlite3_column_type(stmt, i) {
            case SQLITE_INTEGER: row[key] = sqlite3_column_int64(stmt, i)
            case SQLITE_FLOAT: let v = sqlite3_column_double(stmt, i); if v.isFinite { row[key] = v }
            case SQLITE_TEXT: row[key] = String(cString: sqlite3_column_text(stmt, i))
            default: break // Never export private blobs, tokens or account data.
            }
        }
        rows.append(row)
    }
    return rows
}
let allow: [String: [String]] = [
 "ZBKLIBRARYASSET": ["ZASSETID", "ZEPUBID", "ZTITLE", "ZAUTHOR", "ZPATH", "ZCONTENTTYPE", "ZREADINGPROGRESS", "ZISFINISHED", "ZCREATIONDATE", "ZLASTOPENDATE", "ZLASTENGAGEDDATE", "ZDATEFINISHED"],
 "ZAEANNOTATION": ["ZANNOTATIONUUID", "ZANNOTATIONASSETID", "ZANNOTATIONTYPE", "ZANNOTATIONLOCATION", "ZANNOTATIONMODIFICATIONDATE", "ZANNOTATIONCREATIONDATE", "ZANNOTATIONDELETED", "ZANNOTATIONSELECTEDTEXT", "ZANNOTATIONREPRESENTATIVETEXT", "ZANNOTATIONNOTE"],
 "ZBKCOLLECTION": ["Z_PK", "ZTITLE", "ZDELETEDFLAG"],
 "ZBKCOLLECTIONMEMBER": ["ZASSETID", "ZCOLLECTION"],
 "ZBCASSETDETAIL": ["ZASSETID", "ZREADINGPOSITIONCFISTRING", "ZREADINGPOSITIONLOCATIONUPDATEDATE", "ZDELETEDFLAG"]
]
func readDB(_ url: URL, _ tables: [String]) throws -> [String: [[String: Any]]] {
    var source: OpaquePointer?, copy: OpaquePointer?
    guard sqlite3_open_v2(url.path, &source, SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, nil) == SQLITE_OK else {
        defer { sqlite3_close(source) }; throw NSError(domain: "Cannot read Books database. Check Full Disk Access", code: 3)
    }
    defer { sqlite3_close(source) }
    sqlite3_busy_timeout(source, 3000)
    guard sqlite3_open(":memory:", &copy) == SQLITE_OK else { throw NSError(domain: "Snapshot allocation failed", code: 4) }
    defer { sqlite3_close(copy) }
    guard let backup = sqlite3_backup_init(copy, "main", source, "main") else { throw NSError(domain: "Snapshot failed", code: 5) }
    let result = sqlite3_backup_step(backup, -1)
    sqlite3_backup_finish(backup)
    guard result == SQLITE_DONE else { throw NSError(domain: "Books database busy; will retry", code: 6) }
    let present = try query(copy, "SELECT name FROM sqlite_master WHERE type='table'").compactMap { $0["name"] as? String }
    var output = [String: [[String: Any]]]()
    for table in tables where present.contains(table) {
        let columns = try query(copy, "PRAGMA table_info(\"\(table)\")").compactMap { $0["name"] as? String }
        let wanted = (allow[table] ?? []).filter { columns.contains($0) }.map { "\"\($0)\"" }.joined(separator: ",")
        if !wanted.isEmpty { output[table] = try query(copy, "SELECT \(wanted) FROM \"\(table)\"") }
    }
    return output
}
func snapshot() {
    let specs: [(URL, [String])] = [
        (data.appendingPathComponent("Documents/BKLibrary"), ["ZBKLIBRARYASSET", "ZBKCOLLECTION", "ZBKCOLLECTIONMEMBER"]),
        (data.appendingPathComponent("Documents/AEAnnotation"), ["ZAEANNOTATION"]),
        (data.appendingPathComponent("Documents/BCCloudData-iBooks"), ["ZBCASSETDETAIL"]),
        (shared.appendingPathComponent("Documents/BCCloudData-BookDataStoreService/BCAssetData"), ["ZBCASSETDETAIL"])
    ]
    var output = [String: [[String: Any]]](), errors = [String]()
    for (folder, tables) in specs {
        do {
            let urls = try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: [.isSymbolicLinkKey])
            for url in urls where url.pathExtension == "sqlite" {
                if try url.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != false { continue }
                do {
                    for (table, rows) in try readDB(url, tables) { output[table, default: []] += rows }
                } catch { errors.append("\(folder.lastPathComponent): \(error)") }
            }
        } catch { errors.append("\(folder.lastPathComponent): \(error.localizedDescription)") }
    }
    emit(["tables": output, "errors": errors, "libraryAvailable": output["ZBKLIBRARYASSET"] != nil, "booksFrontmost": NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.apple.iBooksX"])
}
func source(_ url: URL) throws {
    let roots = [cloud, data, home.appendingPathComponent("Library/Containers/com.apple.BKAgentService/Data/Documents/iBooks/Books")]
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    guard roots.contains(where: { resolved.path.hasPrefix($0.resolvingSymlinksInPath().path + "/") }) else { throw NSError(domain: "Book source outside Apple Books containers", code: 7) }
    var entries = [[String: Any]](), total: Int64 = 0
    func add(_ item: URL, _ relative: String) throws {
        let values = try item.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey, .fileSizeKey, .contentModificationDateKey])
        guard values.isSymbolicLink != true else { throw NSError(domain: "Symbolic link inside book", code: 8) }
        var info = stat()
        guard lstat(item.path, &info) == 0 else { throw NSError(domain: "Book source unavailable", code: 9) }
        guard info.st_flags & 0x40000000 == 0, !item.lastPathComponent.hasSuffix(".icloud") else {
            try? fm.startDownloadingUbiquitousItem(at: item)
            throw NSError(domain: "Book is cloud-only; download requested, retrying later", code: 10)
        }
        if values.isDirectory != true {
            total += Int64(values.fileSize ?? 0)
            guard total <= 536870912, entries.count < 20000 else { throw NSError(domain: "Book exceeds export limit", code: 11) }
            entries.append(["name": relative, "path": item.path, "size": values.fileSize ?? 0, "mtime": values.contentModificationDate?.timeIntervalSince1970 ?? 0])
        }
    }
    try add(resolved, resolved.lastPathComponent)
    let isDir = try resolved.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true
    if isDir {
        var walkError: Error?
        guard let walk = fm.enumerator(at: resolved, includingPropertiesForKeys: [.isSymbolicLinkKey], options: [], errorHandler: { _, error in walkError = error; return false }) else { throw NSError(domain: "Cannot enumerate book", code: 12) }
        for case let item as URL in walk {
            let relative = String(item.path.dropFirst(resolved.path.count + 1))
            // Drop Books' root bookkeeping, matching exporter keep_member().
            if item.lastPathComponent == ".DS_Store" || (!relative.contains("/") && (relative.hasSuffix(".plist") || relative.lowercased().hasPrefix("bookmarks"))) { continue }
            try add(item, relative)
        }
        if let error = walkError { throw error }
    }
    emit(["directory": isDir, "entries": entries.sorted { ($0["name"] as! String) < ($1["name"] as! String) }])
}
func watch(_ paths: [String]) {
    let callback: FSEventStreamCallback = { _, _, count, _, _, _ in emit(["changed": true, "count": count]) }
    let flags = FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagWatchRoot)
    guard let stream = FSEventStreamCreate(nil, callback, nil, paths as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 1, flags) else { fail("Cannot create FSEvents stream") }
    FSEventStreamSetDispatchQueue(stream, DispatchQueue.main)
    guard FSEventStreamStart(stream) else { fail("Cannot start FSEvents stream") }
    emit(["watching": true]); dispatchMain()
}
func cloudStatus(_ url: URL) throws -> [String: Any] {
    let keys: Set<URLResourceKey> = [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey, .ubiquitousItemIsUploadedKey, .ubiquitousItemIsUploadingKey, .ubiquitousItemHasUnresolvedConflictsKey, .fileSizeKey]
    let v = try url.resourceValues(forKeys: keys)
    var info = stat()
    guard lstat(url.path, &info) == 0 else { throw NSError(domain: "File unavailable", code: 13) }
    let isCloud = info.st_flags & 0x40000000 != 0 || v.ubiquitousItemDownloadingStatus == .notDownloaded
    // Third-party File Providers can also report isUbiquitousItem. Only the
    // iCloud Drive namespace is eligible for Foundation's iCloud eviction API.
    let drive = home.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs").resolvingSymlinksInPath().path
    let resolved = url.resolvingSymlinksInPath().path
    let ubiquitous = v.isUbiquitousItem == true && resolved.hasPrefix(drive + "/")
    let synced = ubiquitous && v.ubiquitousItemIsUploaded == true && v.ubiquitousItemIsUploading != true && v.ubiquitousItemHasUnresolvedConflicts != true
    return ["state": isCloud ? "cloud" : ubiquitous ? "downloaded" : "local", "supported": ubiquitous, "bytes": v.fileSize ?? 0, "synced": synced, "pinned": false]
}
func inspectCloud(_ request: String) throws {
    guard let bytes = request.data(using: .utf8), let files = try JSONSerialization.jsonObject(with: bytes) as? [[String: String]] else { throw NSError(domain: "Invalid file list", code: 14) }
    var results = [[String: Any]]()
    for file in files {
        guard let id = file["id"], let path = file["path"] else { continue }
        let status = (try? cloudStatus(URL(fileURLWithPath: path))) ?? ["state": "missing", "supported": false]
        results.append(["id": id, "status": status])
    }
    emit(results)
}
func releaseCloud(_ file: String) throws {
    let url = URL(fileURLWithPath: file), status = try cloudStatus(url)
    guard status["supported"] as? Bool == true else { throw NSError(domain: "此云盘请使用客户端的移除下载功能", code: 15) }
    if status["state"] as? String == "cloud" { emit(status); return }
    guard status["synced"] as? Bool == true else { throw NSError(domain: "文件尚未上传完成或存在冲突，暂不释放", code: 16) }
    try fm.evictUbiquitousItem(at: url)
    emit(try cloudStatus(url))
}
let args = Array(CommandLine.arguments.dropFirst())
do {
    switch args.first {
    case "snapshot": snapshot()
    case "source": guard args.count == 2 else { fail("source PATH") }; try source(URL(fileURLWithPath: args[1]))
    case "watch": guard args.count > 1 else { fail("watch PATH...") }; watch(Array(args.dropFirst()))
    case "cloud-inspect": guard args.count == 2 else { fail("cloud-inspect JSON") }; try inspectCloud(args[1])
    case "cloud-release": guard args.count == 2 else { fail("cloud-release PATH") }; try releaseCloud(args[1])
    default: fail("snapshot | source PATH | watch PATH... | cloud-inspect JSON | cloud-release PATH")
    }
} catch { fail(error.localizedDescription + " (\(error))") }
