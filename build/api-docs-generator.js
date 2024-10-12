const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const util = require('util');
const crypto = require('crypto');
const exec = util.promisify(require('child_process').exec);

// Promisify the glob function to enable async/await usage
const globPromise = util.promisify(glob);

// Constants
const SRC_DIR = './src';
const BUILD_DIR = './build';
const TEMP_DIR = path.join(BUILD_DIR, 'temp');
const MD_FILES_DIR = path.join('./docs', 'API-Reference');
const TEMP_CHECK_DIR = path.join(BUILD_DIR, 'check_copy');
const BATCH_SIZE = 12;


/**
 * Create directory
 * @param {string} dirPath - The path where the directory will be created
 */
async function createDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}


/**
 * Remove directory
 * @param {string} dirPath - The path to the directory to remove
 */
async function removeDir(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
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
 * Compare two files based on their MD5 hash values
 * @param {string} file1 - Path to the first file
 * @param {string} file2 - Path to the second file
 * @returns {Promise<boolean>} - True if files are different, false otherwise
 */
async function areFilesDifferent(file1, file2) {
    const [content1, content2] = await Promise.all([
        fs.readFile(file1, 'utf-8').then(normalizeLineEndings),
        fs.readFile(file2, 'utf-8').then(normalizeLineEndings)
    ]);

    const hash1 = crypto.createHash('md5').update(content1).digest('hex');
    const hash2 = crypto.createHash('md5').update(content2).digest('hex');

    return hash1 !== hash2;
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
    await fs.writeFile(file, modifiedContent, 'utf-8');

    const outputDir = path.join(MD_FILES_DIR, relativePath);
    await createDir(outputDir);

    const outputFileName = path.join(outputDir, `${fileName}.md`);
    const tempOutputFileName = path.join(
        TEMP_CHECK_DIR, `${fileName}_temp.md`
    );

    await createDir(TEMP_CHECK_DIR);

    // Generate markdown to a temporary file
    await exec(`npx jsdoc-to-markdown ${file} > ${tempOutputFileName}`);

    let markdownContent = await fs.readFile(tempOutputFileName, 'utf-8');
    const updatedMarkdownContent = modifyMarkdown(
        markdownContent, path.join(relativePath, fileName)
    );

    await fs.writeFile(tempOutputFileName, updatedMarkdownContent, 'utf-8');

    const fileExists = await fs.access(outputFileName).then(() => true).catch(
        () => false
    );

    const shouldUpdate = !fileExists || await areFilesDifferent(
        outputFileName, tempOutputFileName
    );

    if (shouldUpdate) {
        await fs.rename(tempOutputFileName, outputFileName);
        console.log(`Updated ${outputFileName}`);
    } else {
        await fs.unlink(tempOutputFileName);
        console.log(`No changes in ${outputFileName}`);
    }
}


/**
 * Cleans up temp directories
 */
async function cleanupTempDir() {
    await removeDir(TEMP_CHECK_DIR);
}


/**
 * Driver function
 */
async function driver() {
    try {
        console.log("Fetching required JS files...");
        const jsFiles = await getJsFiles();
        console.log(`Found ${jsFiles.length} files to process`);

        await createDir(TEMP_DIR);
        await createDir(MD_FILES_DIR);

        for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
            const batch = jsFiles.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (file) => {
                const relativePath = path.relative(
                    SRC_DIR, path.dirname(file)
                );
                const tempDirPath = path.join(TEMP_DIR, relativePath);
                await createDir(tempDirPath);

                const fileName = path.basename(file);
                const destPath = path.join(tempDirPath, fileName);
                await fs.copyFile(file, destPath);

                await generateMarkdown(destPath, relativePath);
                console.log(`Processed ${file}`);
            }));
        }

        await removeDir(TEMP_DIR);
        await cleanupTempDir();
        console.log("All files processed successfully!");
    } catch (error) {
        console.error("An error occurred:", error);
        await removeDir(TEMP_DIR).catch(() => { });
        await cleanupTempDir().catch(() => { });
    }
}

driver().catch(console.error);
