const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const SRC_DIR = './src';
const BUILD_DIR = './build';
const TEMP_DIR = path.join(BUILD_DIR, 'temp');
const MD_FILES_DIR = path.join('./docs', 'API-Reference');

const globPromise = util.promisify(glob);

/**
 * Responsible to get the JS Files that are to be included in API DOCS
 * @returns {Promise<string[]>} Promise resolving to list of JS Files for API Docs
 */
async function getJsFiles() {
    const allJsFiles = await globPromise(`${SRC_DIR}/**/*.js`);
    const requiredJSfiles = [];

    await Promise.all(allJsFiles.map(async (file) => {
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
 * Creates a directory
 * @param {string} dirPath creates dir at the given path
 */
async function createDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Deletes a directory
 * @param {string} dirPath deletes dir from the given path
 */
async function removeDir(dirPath) {
    await fs.rm(dirPath, { recursive: true, force: true });
}

/**
 * Adjusts JavaScript content for compatibility with jsdoc-to-markdown
 * @param {string} content The content to be modified
 * @param {string} fileName To replace the define block with this name
 * @returns {string} Updated content
 */
function modifyJs(content, fileName) {
    if (content.includes('\n(function () {')) {
        content = content.replace(/\(function \(\) \{/, '');
        if (content.trim().endsWith('}());')) {
            content = content.trim().slice(0, -5);
        }

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
                    content = content.slice(0, indx) + content.slice(tempIndx + 1);
                    bracketCount++;
                    break;
                }
            }
        }
    } else if (content.includes('define(function')) {
        content = content.replace(/define\(function\s*\([^)]*\)\s*{/, '');
        if (content.trim().endsWith('});')) {
            content = content.trim().slice(0, -3);
        }
    }
    return content;
}

/**
 * Modifies markdown content for compatibility with docusaurus
 * @param {string} content markdown file content
 * @param {string} relativePath Relative path of the file from MD_FILES_DIR
 * @returns {string} updated markdown file content
 */
function modifyMarkdown(content, relativePath) {
    const anchorIndex = content.indexOf('<a name');
    if (anchorIndex !== -1) {
        content = content.slice(anchorIndex);
    }

    const modulePath = path.join(
        path.dirname(relativePath),
        path.basename(relativePath, '.md')
    ).replace(/\\/g, '/');

    const importStatement = '### Import :\n' +
        `\`\`\`js\nconst ${path.basename(relativePath, '.md')} = ` +
        `brackets.getModule("${modulePath}")\n\`\`\`\n\n`;

    return importStatement + content.replace(/~/g, '.');
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
    await exec(`npx jsdoc-to-markdown ${file} > ${outputFileName}`);

    const markdownContent = await fs.readFile(outputFileName, 'utf-8');
    const updatedMarkdownContent = modifyMarkdown(markdownContent, path.join(relativePath, fileName));
    await fs.writeFile(outputFileName, updatedMarkdownContent, 'utf-8');
}

/**
 * Handles the execution and control flow of the program
 */
async function driver() {
    try {
        console.log("Fetching required JS files...");
        const jsFiles = await getJsFiles();
        console.log(`Found ${jsFiles.length} files to process`);

        await createDir(TEMP_DIR);
        await createDir(MD_FILES_DIR);

        // Process files in batches to avoid overwhelming the system
        const BATCH_SIZE = 12;
        for (let i = 0; i < jsFiles.length; i += BATCH_SIZE) {
            const batch = jsFiles.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (file) => {
                const relativePath = path.relative(SRC_DIR, path.dirname(file));
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
        console.log("All files processed successfully!");
    } catch (error) {
        console.error("An error occurred:", error);
        // Cleanup temp directory in case of error
        await removeDir(TEMP_DIR).catch(() => { });
    }
}

driver().catch(console.error);
