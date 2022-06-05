/* eslint-env node */

/**
 * Generate markdown documentation for all files labelled with @INCLUDE_IN_PHOENIX_API_DOCS into the docs folder.
 * @param file
 * @returns {*}
 */
function processFile(file) {
    // For file properties https://gulpjs.com/docs/en/api/vinyl/
    const code = file.contents.toString();
    if(code.includes("@INCLUDE_IN_PHOENIX_API_DOCS")){
        console.log("Generating Doc for: ", file.relative);
        file.contents = Buffer.from("hello");
        file.extname = ".md";
        return file;
    }
}

exports.processFile = processFile;
