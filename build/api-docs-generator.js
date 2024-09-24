const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { execSync } = require('child_process');

const SRC_DIR = './src';
const BUILD_DIR = './build';
const DOCS_DIR = './docs';

// JS files that are to be converted to MDX are in this directory
const JS_FILES_DIR = path.join(BUILD_DIR, 'JS-Files');
// Converted MDX files are in this directory
const MDX_FILES_DIR = path.join(BUILD_DIR, 'MDX-FILES');

// these are temporary files required for conversion process,
// will automatically be deleted
const TEMP_DIR = path.join(BUILD_DIR, 'TEMP');
const JSDOC_FILE = path.join(BUILD_DIR, 'jsdoc.json');
const CONFIG_FILE = path.join(BUILD_DIR, 'config.json');


const JSDOC_JSON_TEMPLATE = {
    "source": {
        "include": [
            "TEMP"
        ]
    },
    "plugins": [
        "plugins/markdown"
    ],
    "opts": {
        "destination": "TEMP_MDX"
    }
};

const CONFIG_JSON_TEMPLATE = {
    "outDir": "TEMP_MDX",
    "jsdoc": "./jsdoc.json",
    "bulma": false
};

/**
 * Creates required files & directories
 * Writes content inside config.json & jsdoc.json
 */
function createRequiredDir() {
    fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(CONFIG_JSON_TEMPLATE, null, 2)
    );

    fs.writeFileSync(
        JSDOC_FILE,
        JSON.stringify(JSDOC_JSON_TEMPLATE, null, 2)
    );

    fs.mkdirSync(MDX_FILES_DIR, { recursive: true });
}


/**
 * To get all the JS files from src dir that are to be converted to MDX
 * Creates a copy of all required JS files into JS-Files directory
 * @returns {array} list of all required JS files
 */
function getJsFiles() {
    // gets all JS files from src
    // (even the ones that we don't need to add in API docs)
    const files = glob.sync(`${SRC_DIR}/**/*.js`);
    // this gets all the files that we need to add in API docs
    const requiredJSfiles = [];
    for (const file of files) {
        // Check if it's a file (not a directory)
        if (fs.statSync(file).isFile()) {

            const content = fs.readFileSync(file, "utf-8");
            // check if file has this line, if yes include it in the list
            if (content.includes("@INCLUDE_IN_API_DOCS")) {

                // to copy all files from into JS-Files dir,
                // while maintaining the sub-directory structure
                const relativePath = path.relative(SRC_DIR, file);
                const destPath = path.join(JS_FILES_DIR, relativePath);
                requiredJSfiles.push(destPath);
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(file, destPath);

            }
        }
    }
    return requiredJSfiles;
}

/**
 * Handles the generation of MDX from JS file
 * Does it in two step process,
 * (because MDX was unable to parse due to some issues)
 * 1. Gets all the JSDoc content from the start of the file i.e. before code
 * 2. Gets JSDoc content from between the code
 * @param {stringPathLike} file The current JS file i.e. to be converted
 */
function generateMDX(file) {
    // a copy of the content, to update the content later.
    const copyContent = fs.readFileSync(file, "utf-8");

    // replace the RequireJS code block with `Export` block
    // because MDX cannot parse RequireJS
    let content = replaceRequireJSCode(file);
    fs.writeFileSync(file, content, "utf-8");

    // execute the command, 1st step completed (refer to this function's JSDoc)
    execSync(`npx jsdoc-to-mdx -c ${path.relative(BUILD_DIR, CONFIG_FILE)}`,
        { cwd: BUILD_DIR }
    );

    // we expect a single MDX file here, but
    // sometimes due to parsing issues it can create multiple mdx files,
    // we need only the main file, removing all others
    const removeFiles = glob.sync(`${BUILD_DIR}/TEMP_MDX/*.mdx`);
    if (removeFiles.length > 1) {

        for (const removeFile of removeFiles) {
            // Description.mdx because it is the main function name,
            // so main file gets created with this name
            if (!removeFile.endsWith('Description.mdx')) {
                fs.unlinkSync(removeFile);
            }
        }
    }

    // rename mdx file to its filename `Eg.(Description.mdx -> filename.mdx)`
    renameMdxFile(path.basename(file, '.js'));

    // reverse back the content i.e. was modified
    // for 2nd step
    fs.writeFileSync(file, copyContent, "utf-8");

    // Completely removes the RequireJS code block
    // so that the inner JSDoc comments can be parsed
    content = removeRequireJSCode(file);
    fs.writeFileSync(file, content, "utf-8");

    // create a temp folder inside temp_mdx
    // because it creates multiple mdx files
    // which will merge it to the main mdx file later
    fs.mkdirSync(
        path.join("build", "TEMP_MDX", "TEMP"),
        { recursive: true }
    );

    // modify jsdoc and config file destination paths
    // so that mdx files are now generated inside temp dir
    JSDOC_JSON_TEMPLATE.opts.destination = path.join("TEMP_MDX", "TEMP");
    fs.writeFileSync(
        JSDOC_FILE, JSON.stringify(JSDOC_JSON_TEMPLATE, null, 2)
    );

    CONFIG_JSON_TEMPLATE.outDir = path.join("TEMP_MDX", "TEMP");
    fs.writeFileSync(
        CONFIG_FILE, JSON.stringify(CONFIG_JSON_TEMPLATE, null, 2)
    );

    execSync(`npx jsdoc-to-mdx -c ${path.relative(BUILD_DIR, CONFIG_FILE)}`,
        { cwd: BUILD_DIR }
    );
}

/**
 * Replace RequireJS `define` code blocksand IIFE functions with `export`
 * as JSDoc-to-MDX cannot parse `define` blocks and IIFE functions
 * @param {stringPathLike} file Javascript file path
 * @return {string} updated content for the file
 */

function replaceRequireJSCode(file) {
    let content = fs.readFileSync(file, "utf-8");


    if (content.includes('\n(function () {')) {
        // IIFE function modification

        content = content.replace(
            /\(function \(\) \{/,
            'export function Description () {'
        );

        // Remove matching closing parentheses
        if (content.trim().endsWith('}());')) {
            content = content.trim().slice(0, -4);
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

        // replace define block with export block
        content = content.replace(
            /define\(function\s*\([^)]*\)\s*{/,
            'export function Description () {'
        );

        // remove trailing braces from define block
        if (content.trim().endsWith('});')) {
            content = content.trim().slice(0, -2);
        }
    }

    // Fix some JSDoc issues, where MDX breaks
    content = content.replace("@param {*}", '@param {any} any');
    content = content.replace("@param {...}", '@param {rest} rest');
    content = content.replace(/@module/g, 'module');

    return content;

}

/**
 * Remove RequireJS `define` code blocks and IIFE functions
 * as JSDoc-to-MDX cannot parse `define` blocks and IIFE functions
 * @param {stringPathLike} file Javascript file path
 * @return {string} updated content for the file
 */
function removeRequireJSCode(file) {
    let content = fs.readFileSync(file, "utf-8");

    // Remove the JSDoc comments from 1st part
    // i.e. those comments which are already covered
    content = content.replace(/\/\*\*[\s\S]*?\*\//, '');

    if (content.includes('\n(function () {')) {

        // IIFE function removal
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
        // remove define block
        content = content.replace(
            /define\(function\s*\([^)]*\)\s*{/,
            ''
        );

        // remove trailing braces from define block
        if (content.trim().endsWith('});')) {
            content = content.trim().slice(0, -3);
        }
    }

    // Fix some JSDoc issues, where MDX breaks
    content = content.replace("@param {*}", '@param {any} any');
    content = content.replace("@param {...}", '@param {rest} rest');
    content = content.replace(/@module/g, 'module');

    return content;

}


/**
 * Rename the Description.mdx file to its filename
 * for ex :- (Description.mdx -> Metrics.mdx)
 * Description is the default name provided for the main MDX file
 * @param {string} fileName The new name for the file
 */
function renameMdxFile(fileName) {
    const generatedMDXFilePath = path.join(
        BUILD_DIR, 'TEMP_MDX', 'Description.mdx'
    );
    const newMDXFilePath = path.join(
        BUILD_DIR, 'TEMP_MDX', `${fileName}.mdx`
    );
    fs.renameSync(generatedMDXFilePath, newMDXFilePath);
}


/**
 * This function is responsible to merge all the MDX files into one
 */
function mergeMdxFiles() {

    // Note: mainFile will be an array with just 1 file i.e. [0]
    const mainFile = glob.sync(
        `${BUILD_DIR}/TEMP_MDX/*.mdx`
    );

    // files to be merged into mail file
    const mergeFiles = glob.sync(
        `${BUILD_DIR}/TEMP_MDX/TEMP/*.mdx`
    );

    let mergedContent = fs.readFileSync(mainFile[0], "utf8");

    for (let mergeFile of mergeFiles) {
        const content = fs.readFileSync(mergeFile, "utf8");

        mergedContent += '\n\n' + content;
    }

    // update the content after merging
    fs.writeFileSync(mainFile[0], mergedContent, "utf8");

    // deleting the merged mdx files
    fs.rmSync(path.join(BUILD_DIR, 'TEMP_MDX', 'TEMP'),
        { recursive: true, force: true }
    );

}


/**
 * After merging all the mdx files into one single mdx file,
 * move the file to MDX_FILES_DIR, maintaining the sub-directory structure
 * MDX_FILES_DIR is the main dir which will store all the generated MDX files
 * @param {stringPathLike} filePath JS filepath to maintain sub-dir structure
 */
function moveFileToMdxDir(filePath) {

    // separate the sections...(like features, utils etc)
    // also makes sure it works fine on any OS (whether linux/windows)
    const getDirName = path.normalize(filePath).split(path.sep)[2];


    let mdxDirPath;
    let file;

    // when it is not a dir but instead a file
    // for ex :- NodeConnector is not inside any sub-dir
    if (getDirName.endsWith('.js')) {
        file = glob.sync(`${BUILD_DIR}/TEMP_MDX/*.mdx`);
        mdxDirPath = MDX_FILES_DIR + '/' + path.basename(file[0]);

    } else {
        mdxDirPath = path.join(
            MDX_FILES_DIR, getDirName
        );

        // create sub-dir if not exists, for ex :- features, utils
        if (!(fs.readdirSync(MDX_FILES_DIR).includes(getDirName))) {
            fs.mkdirSync(mdxDirPath);
        }

        file = glob.sync(`${BUILD_DIR}/TEMP_MDX/*.mdx`);
        mdxDirPath += '/' + path.basename(file[0]);
    }

    fs.copyFileSync(file[0], mdxDirPath);

    // deleting TEMP_MDX dir, as file is now copied to MDX_FILES_DIR
    fs.rmSync(path.join(BUILD_DIR, 'TEMP_MDX'),
        { recursive: true, force: true }
    );

    // deleting TEMP dir, as this JS file has been successfully converted
    fs.rmSync(path.join(BUILD_DIR, 'TEMP'),
        { recursive: true, force: true }
    );

    // reset config.json and jsdoc.json
    JSDOC_JSON_TEMPLATE.opts.destination = "TEMP_MDX";
    fs.writeFileSync(
        JSDOC_FILE, JSON.stringify(JSDOC_JSON_TEMPLATE, null, 2)
    );

    CONFIG_JSON_TEMPLATE.outDir = "TEMP_MDX";
    fs.writeFileSync(
        CONFIG_FILE, JSON.stringify(CONFIG_JSON_TEMPLATE, null, 2)
    );

}


/**
 * Function responsible to fix MDX file issues
 * And make it more readable and useful
 */
function mdxFileModifications() {

    const mdxFiles = glob.sync('build/MDX-FILES/**/*.mdx');

    for (const mdxFile of mdxFiles) {
        let content = fs.readFileSync(mdxFile, "utf8");

        // Escape curly braces
        content = content.replace(/\{/g, '\\{');

        // Remove custom_edit_url lines
        content = content.replace(
            /---\s*custom_edit_url:\s*null\s*---/g,
            ''
        );

        // remove function keyword and parantheses from description section
        // added while replacing require JS code
        // function Description() -> ### Description
        content = content.replace(
            /```ts\s*\nfunction\s+Description\s*\(\)\s*\n```/g,
            "### Description"
        );

        // create subheadings for functions, const, events, members etc
        // subheadings are displayed on the right panel of Docs site
        content = createSubHeadings(content);

        // Add import statement at the top of every file
        // and how to import i.e. with dirname and filename
        const directoryName = path.basename(mdxFile.split('/')[2]);
        const fileNameWithoutExt = path.basename(mdxFile, '.mdx');

        let importStatement = '';
        // when file has no parent sub-dir
        // for example NodeConnector.mdx
        if (directoryName.endsWith('.mdx')) {
            importStatement =
                `### Import :\n\`\`\`js\n` +
                `brackets.getModule("${fileNameWithoutExt}")\n` +
                `\`\`\`\n`;
        } else {
            importStatement =
                `### Import :\n\`\`\`js\n` +
                `brackets.getModule("${fileNameWithoutExt}")\n` +
                `\`\`\`\n`;
        }


        let finalContent = importStatement;
        finalContent += '\n' + content;

        fs.writeFileSync(mdxFile, finalContent, "utf8");
    }
}


/**
 * Function responsible to create subheadings
 * for functions, const, events, members etc
 * subheadings are displayed on the right panel of Docs site
 * @param {string} content MDX File content
 * @returns {string} modified content
 */
function createSubHeadings(content) {
    const lines = content.split('\n');

    // will recreate the content parsing it line by line
    const processedLines = [];
    let i = 0;

    while (i < lines.length) {

        // wherever we get ```ts, check if next line has a matching keyword
        // if yes then replace it with ### to create the sub-heading
        if (lines[i].trim() === '```ts') {

            if (lines[i + 1].trim().startsWith('function')) {
                processedLines.push(lines[i + 1]
                    .replace('function', '###').trim());

            } else if (lines[i + 1].trim().startsWith('const')) {
                processedLines.push(lines[i + 1]
                    .replace('const', '###').trim());

            } else if (lines[i + 1].trim().startsWith('class')) {
                processedLines.push(lines[i + 1]
                    .replace('class', '###').trim());

            } else if (lines[i + 1].trim().startsWith('new')) {
                processedLines.push(lines[i + 1]
                    .replace('new', '###').trim());

            } else if (lines[i + 1].trim().startsWith('event')) {
                processedLines.push(lines[i + 1]
                    .replace('event', '###').trim());

            } else if (lines[i + 1].trim().startsWith('member')) {
                processedLines.push(lines[i + 1]
                    .replace('member', '###').trim());

            }
            i += 3; // Skip the next line (which should be the closing ```)
        } else {
            processedLines.push(lines[i]);
            i++;
        }
    }
    return processedLines.join('\n');

}


/**
 * Delete all the non-required files and folders
 * as MDX has been completely generated
 */
function deleteFiles() {
    fs.rmSync(JS_FILES_DIR,
        { recursive: true, force: true }
    );

    // remove config and jsdoc file
    fs.unlinkSync(path.join(BUILD_DIR, 'config.json'));
    fs.unlinkSync(path.join(BUILD_DIR, 'jsdoc.json'));
}


/**
 * Move the MDX_FILES_DIR from build directory to docs dir
 */
function moveMdxDirToDocs() {
    const oldLocation = MDX_FILES_DIR;
    const newLocation = path.join(DOCS_DIR, 'API-Reference');

    fs.renameSync(oldLocation, newLocation);
}


/**
 * This function handles the control flow of the program
 */
function driver() {

    console.log("Process started!");

    createRequiredDir();

    const requiredJSfiles = getJsFiles();
    console.log("JS-Files dir ready");

    for (let jsFile of requiredJSfiles) {

        // create temporary dir and copy js file,
        // to convert it to MDX
        const fileName = path.basename(jsFile, '.js');
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        fs.copyFileSync(jsFile, path.join(TEMP_DIR, `${fileName}.js`));

        console.log(
            `Converting ${path.join(TEMP_DIR, `${fileName}.js`)} to MDX`
        );

        // generate MDX files
        generateMDX(path.join(TEMP_DIR, `${fileName}.js`));

        console.log(
            `Converted ${path.join(TEMP_DIR, `${fileName}.js`)} to MDX`
        );

        // merge all the generated MDX files
        mergeMdxFiles();
        console.log(`${fileName}.js merged successfully!`);

        // move the merged MDX file from TEMP_DIR to MDX_FILES_DIR
        moveFileToMdxDir(jsFile);
        console.log(`${fileName}.js moved successfully`);
        console.log('\n');
    }

    // after all the MDX files has been generated

    // Make the necessary changes to the MDX files
    // so that docusaurus can parse it correctly
    mdxFileModifications();
    console.log("MDX file modifications successful");

    // delete non-required files and folders
    deleteFiles();
    console.log("Deleted non-required files");

    // move MDX_FILES_DIR from build dir to Docs dir
    moveMdxDirToDocs();
    console.log("All set! Just move the docs dir to Docs site");

}

driver();
