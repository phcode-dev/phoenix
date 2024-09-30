const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { execSync } = require('child_process');


const SRC_DIR = './src';
const BUILD_DIR = './build';

// Temp dir will automatically be removed after markdown is generated
const TEMP_DIR = path.join(BUILD_DIR, 'temp');
const MD_FILES_DIR = path.join('./docs', 'API-Reference');

/**
 * Responsible to get the JS Files,
 * that are to be included in API DOCS
 * @returns {[]} list of JS Files that are to be included in API Docs
 */
function getJsFiles() {
    // this gives all the JS Files, from src direcotry
    const allJsFiles = glob.sync(`${SRC_DIR}/**/*.js`);

    // those files that are to be included in API Docs
    const requiredJSfiles = [];

    for (const file of allJsFiles) {
        // make sure it is a file, and not a dir
        if (fs.statSync(file).isFile()) {
            const content = fs.readFileSync(file, 'utf-8');

            // we check for this line, as we only need
            // those files that has this line.
            if (content.includes('@INCLUDE_IN_API_DOCS')) {
                requiredJSfiles.push(file);
            }
        }
    }
    return requiredJSfiles;
}

/**
 * responsible to create a directory
 * @param {string path} dirPath creates dir at the given path
 */
function createDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * responsible to delete a directory
 * @param {string path} dirPath deletes dir from the given path
 */
function removeDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * This function adjusts JavaScript content
 * to ensure compatibility with jsdoc-to-markdown.
 * @param {string} content The content of the file, i.e. to be modified
 * @param {string} fileName To replace the define block with this name
 * @returns {string} Updated content
 */
function modifyJs(content, fileName) {

    // remove function wrapper
    if (content.includes('\n(function () {')) {

        content = content.replace(
            /\(function \(\) \{/,
            ''
        );

        // Remove matching closing parentheses
        if (content.trim().endsWith('}());')) {
            content = content.trim().slice(0, -5);
        }

        // Clean up any leftover unmatched brackets
        // removing `function wrapper` leads to an unmatched '}' and ')'
        // this logic just removes the unmatched brackets.
        let bracketCount = 0;
        for (let indx = 0; indx < content.length; indx++) {
            if (content[indx] === '{') {
                bracketCount++;
            } else if (content[indx] === '}') {
                bracketCount--;
                if (bracketCount < 0) {
                    let tempIndx = indx;
                    while (content[indx] && content[indx] !== ')') {
                        indx--;
                    }
                    content = content.slice(0, indx)
                        + content.slice(tempIndx + 1);
                    bracketCount++;
                    break;
                }
            }
        }
    } else if (content.includes('define(function')) {

        // remove define blocks
        content = content.replace(
            /define\(function\s*\([^)]*\)\s*{/,
            ''
        );

        // remove trailing braces from define block
        if (content.trim().endsWith('});')) {
            content = content.trim().slice(0, -3);
        }
    }

    return content;
}


/**
 * When generating markdown from JSDoc,
 * some unwanted tags gets generated at the top of the MD file,
 * we need to remove it, as it causes compatibility issues with docusaurus
 * Also adds import statements at the top of every file
 * @param {string} content markdown file content
 * @param {string} relativePath Relative path of the file from MD_FILES_DIR
 * @returns {string} updated markdown file content
 */
function modifyMarkdown(content, relativePath) {
    // to start the markdown from '<a' tag
    const anchorIndex = content.indexOf('<a name');
    if (anchorIndex !== -1) {
        content = content.slice(anchorIndex);
    }

    // Add the import statement
    const modulePath = path.join(
        path.dirname(relativePath),
        path.basename(relativePath, '.md')
    ).replace(/\\/g, '/');

    const importStatement = '### Import :\n' +
        `\`\`\`js\nconst ${path.basename(relativePath, '.md')} = ` +
        `brackets.getModule("${modulePath}")\n\`\`\`\n\n`;

    content = content.replace(/~/g, '.');

    // Combine the import statement with the modified content
    return importStatement + content;
}


/**
 * Generates markdown documentation for a given JavaScript file
 * @param {string} file Path to the JavaScript file
 * @param {string} relativePath Relative path of the file from SRC_DIR
 */
function generateMarkdown(file, relativePath) {
    let content = fs.readFileSync(file, 'utf-8');
    const fileName = path.basename(file, '.js');

    // update the JS file to make it compatible with JsDoc-to-MD library
    content = modifyJs(content, fileName);
    fs.writeFileSync(file, content, 'utf-8');

    // generate the markdown on the required directory
    const outputDir = path.join(MD_FILES_DIR, relativePath);
    createDir(outputDir);
    const outputFileName = path.join(outputDir, `${fileName}.md`);
    execSync(`npx jsdoc-to-markdown ${file} > ${outputFileName}`);

    // update the MD file to make it compatible with Docusaurus and add import statement
    let markdownContent = fs.readFileSync(outputFileName, 'utf-8');
    const updatedMarkdownContent = modifyMarkdown(markdownContent, path.join(relativePath, fileName));
    fs.writeFileSync(outputFileName, updatedMarkdownContent, 'utf-8');
}


/**
 * Handles the execution and control flow of the program
 */
function driver() {
    const jsFiles = getJsFiles();
    console.log("Fetched all required JS files");

    createDir(TEMP_DIR);
    createDir(MD_FILES_DIR);

    for (const file of jsFiles) {
        const relativePath = path.relative(SRC_DIR, path.dirname(file));
        const tempDirPath = path.join(TEMP_DIR, relativePath);
        createDir(tempDirPath);

        // copy the file from src to temp dir for modifications
        const fileName = path.basename(file);
        const destPath = path.join(tempDirPath, fileName);
        fs.copyFileSync(file, destPath);

        generateMarkdown(destPath, relativePath);
        console.log(`${file} successfully converted to Markdown`);
    }

    removeDir(TEMP_DIR);

    console.log("All set!!!");
}

driver();
