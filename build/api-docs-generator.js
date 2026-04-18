const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const util = require('util');
const crypto = require('crypto');
const jsdoc2md = require('jsdoc-to-markdown');

// Promisify the glob function to enable async/await usage
const globPromise = util.promisify(glob);

// Constants
const SRC_DIR = './src';
const MD_FILES_DIR = path.join('./docs', 'API-Reference');
const BATCH_SIZE = 12;


/**
 * Create directory
 * @param {string} dirPath - The path where the directory will be created
 */
async function createDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}


/**
 * Responsible to extract file names with their parent dir
 * Ex :- docs/API-Reference/worker/WorkerComm -> worker/WorkerComm
 * @param {array} files list of all the files
 * @param {string} excludeParent for files with no parent dir(eg:NodeConnector)
 * @returns array of all file names
 */
function getFileNames(files, excludeParent) {
    return files.map(filePath => {
        // Extract directory and filename
        const { dir, name } = path.parse(filePath);
        // Get the parent folder name
        const parentFolder = path.basename(dir);

        // Check if the parent folder is the one to exclude
        // Return only the base name if it's the excluded parent
        if (parentFolder === excludeParent) {
            return name;
        }

        // Combine if parent folder exists
        return parentFolder ? `${parentFolder}/${name}` : name;
    });
}

// Main async function to get existing markdown and js files
/**
 * Responsible to remove all non-required markdown files
 * If `@INCLUDE_IN_API_DOCS` is removed from the source file
 * @param {array} jsFiles files to be included in API docs
 */
async function getExistingMarkdownFiles(jsFiles) {
    const mdFiles = await globPromise(`./docs/API-Reference/**/*.md`);

    // Get markdown file names without extensions
    const mdFileNames = getFileNames(mdFiles, 'API-Reference');

    // Get JS file names without extensions
    const jsFileNames = getFileNames(jsFiles, 'src');

    const filesToRemove = mdFileNames.filter(
        mdFileName => !jsFileNames.includes(mdFileName)
    );

    for (const mdFile of mdFiles) {
        const temp = String(getFileNames([mdFile], 'API-Reference'));
        if (filesToRemove.includes(temp)) {
            await fs.unlink(mdFile);
            console.log(
                `${mdFile} has been removed as no more needed in API docs`
            );
        }
    }

    console.log('All non required files removed successfully!');
}


/**
 * Responsible to get the JS Files that are to be included in API DOCS
 * @returns {Promise<string[]>} Promise resolving,list of JS Files for API Docs
 */
async function getJsFiles() {
    const allJsFiles = await globPromise(`${SRC_DIR}/**/*.js`);
    const requiredJSfiles = [];

    await Promise.all(allJsFiles.map(async (file) => {
        // Check if the path points to a valid file
        const stats = await fs.stat(file);
        if (stats.isFile()) {
            const content = await fs.readFile(file, 'utf-8');
            if (content.includes('@INCLUDE_IN_API_DOCS')) {
                requiredJSfiles.push(file);
            }
        }
    }));

    return requiredJSfiles;
}


/**
 * Adjusts JavaScript content for compatibility with jsdoc-to-markdown
 * @param {string} content The content to be modified
 * @returns {string} Updated content
 */
function modifyJs(content) {
    if (content.includes('\n(function () {')) {
        content = content.replace(/\(function \(\) \{/, '');

        if (content.trim().endsWith('}());')) {
            // Remove trailing IIFE closing
            content = content.trim().slice(0, -5);
        }

        let bracketCount = 0;
        for (let indx = 0; indx < content.length; indx++) {
            if (content[indx] === '{') {
                bracketCount++;
            } else if (content[indx] === '}') {
                bracketCount--;
            }

            // Remove any unmatched closing brackets
            if (bracketCount < 0) {
                let tempIndx = indx;
                while (content[indx] && content[indx] !== ')') {
                    indx--;
                }
                content = content.slice(0, indx) + content.slice(tempIndx + 1);
                bracketCount++;
                break;
            }
        }
    } else if (content.includes('define(function')) {
        content = content.replace(/define\(function\s*\([^)]*\)\s*{/, '');
        if (content.trim().endsWith('});')) {
            // Remove AMD-style wrapper
            content = content.trim().slice(0, -3);
        }
    }
    return content;
}


/**
 * Adjusts markdown content for compatibility with Docusaurus
 * Adds import examples and fixes formatting issues
 * @param {string} content - Original markdown content
 * @param {string} relativePath - Relative path to the JS file
 * @returns {string} - Modified markdown content
 */
function modifyMarkdown(content, relativePath) {
    const anchorIndex = content.indexOf('<a name');
    if (anchorIndex !== -1) {
        // Remove every content that appears before anchor tag
        // as non-required content might get generated
        content = content.slice(anchorIndex);
    }

    const modulePath = path.join(
        path.dirname(relativePath),
        path.basename(relativePath, '.md')
    ).replace(/\\/g, '/');

    const importStatement = `### Import :\n` +
        `\`\`\`js\n` +
        `const ${path.basename(relativePath, '.md')} = ` +
        `brackets.getModule("${modulePath}")\n\`\`\`\n\n`;

    // brackets~getModule is wrong
    // brackets.getModule
    return importStatement + content.replace(/~/g, '.');
}


/**
 * Normalizes line endings to LF (\n)
 * to ensure consistent comparisons between files
 * @param {string} content - Content with potentially mixed line endings
 * @returns {string} - Content with normalized line endings
 */
function normalizeLineEndings(content) {
    return content.replace(/\r\n|\r/g, '\n');
}


/**
 * Generates markdown documentation for a given JavaScript file
 * @param {string} file Path to the JavaScript file
 * @param {string} relativePath Relative path of the file from SRC_DIR
 */
async function generateMarkdown(file, relativePath) {
    const content = await fs.readFile(file, 'utf-8');
    const fileName = path.basename(file, '.js');

    const modifiedContent = modifyJs(content, fileName);

    // Generate markdown using jsdoc-to-markdown as a library
    const markdownContent = await jsdoc2md.render({ source: modifiedContent });
    const newContent = normalizeLineEndings(
        modifyMarkdown(markdownContent, path.join(relativePath, fileName))
    );

    const outputDir = path.join(MD_FILES_DIR, relativePath);
    await createDir(outputDir);

    const outputFileName = path.join(outputDir, `${fileName}.md`);

    // Compare with existing file in memory to avoid unnecessary writes
    let existingContent = null;
    try {
        existingContent = await fs.readFile(outputFileName, 'utf-8');
    } catch (e) {
        // File doesn't exist yet
    }

    const newHash = crypto.createHash('md5').update(newContent).digest('hex');
    const existingHash = existingContent
        ? crypto.createHash('md5').update(existingContent).digest('hex')
        : null;

    if (newHash !== existingHash) {
        await fs.writeFile(outputFileName, newContent, 'utf-8');
        console.log(`Updated ${outputFileName}`);
    } else {
        console.log(`No changes in ${outputFileName}`);
    }
}


/**
 * Driver function
 */
async function driver() {
    try {
        console.log("Fetching required JS files...");
        const jsFiles = await getJsFiles();
        await getExistingMarkdownFiles(jsFiles);

        console.log(`Found ${jsFiles.length} files to process`);
        await createDir(MD_FILES_DIR);

        for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
            const batch = jsFiles.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (file) => {
                const relativePath = path.relative(
                    SRC_DIR, path.dirname(file)
                );
                await generateMarkdown(file, relativePath);
                console.log(`Processed ${file}`);
            }));
        }

        console.log("All files processed successfully!");
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

driver().catch(console.error);
