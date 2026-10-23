const { after } = require("node:test");
const lib = require("../desktop/library.cjs");
const opened = new Set();
class Library extends lib.Library {
  constructor(...args) {
    super(...args);
    opened.add(this);
  }
}
// Windows Cloud Files queries keep a PowerShell worker alive during the tests.
after(() => {
  for (const library of opened) library.close();
});
module.exports = { ...lib, Library };
