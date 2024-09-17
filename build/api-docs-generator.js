const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define the input and output directories
const inputDir = path.join(__dirname, '../src');

// DONOT MODIFY THIS 
const outputDir = path.join(__dirname, './dev-temp'); // this directory will be automatically removed (required for automative processes, the final output will be in API directory). 



/**
 * Checks if a file contains a specific line.
 * This function is called to check if a file has @  INCLUDE_IN_API_DOCS 
 * @param {string} filePath - Path to the file
 * @param {string} line - Line to search for
 * @returns {boolean} True if the line is found, false otherwise
 */
function fileContainsLine(filePath, line) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(line);
}


/**
 * Recursively processes files in the input directory.
 * Copies JS files containing '@INCLUDE_IN_API_DOCS' to the output directory,
 * maintaining the original directory structure.
 * 
 * @param {string} dir - Current directory being processed
 * @param {string} baseDir - Base input directory for maintaining structure
 */
function processFilesRecursively(dir, baseDir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Create corresponding directory in output
      const newOutputDir = path.join(outputDir, path.relative(baseDir, filePath));
      if (!fs.existsSync(newOutputDir)) {
        fs.mkdirSync(newOutputDir, { recursive: true });
      }

      // Recurse into subdirectories
      processFilesRecursively(filePath, baseDir);
    } else if (file.toLowerCase().endsWith('.js')) {
      // Check if file should be included in API docs
      if (fileContainsLine(filePath, '@INCLUDE_IN_API_DOCS')) {
        const newFilePath = path.join(outputDir, path.relative(baseDir, filePath));
        fs.copyFileSync(filePath, newFilePath);
      }
    }
  });
}

/**
 * Removes RequireJS code and IIFE wrapper functions.
 * Also fixes some JSDoc issues that jsdoc-to-mdx doesn't handle well.
 * mdx doesn't allow {*} as a param value so modifying it to {any}
 * mdx doesn't allow {...} as a param value so modifying it to {rest}
 * 
 * 
 * @param {string} dir - Directory containing files to process
 */
function removeRequireJSCode(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Recurse into subdirectories
      removeRequireJSCode(filePath);
    } else {
      try {
        let content = fs.readFileSync(filePath, 'utf8');
        let modifiedContent = content;

        // Fix some JSDoc issues
        modifiedContent = modifiedContent.replace("@param {*}", '@param {any} any');
        modifiedContent = modifiedContent.replace("@param {...}", '@param {rest} rest');
        modifiedContent = modifiedContent.replace(/@module/g, 'module');

        // Remove RequireJS define blocks
        if (modifiedContent.includes('define(function')) {
          modifiedContent = modifiedContent.replace(/define\(function\s*\([^)]*\)\s*{/, '');

          // Remove matching closing parentheses
          if (modifiedContent.trim().endsWith('});')) {
            modifiedContent = modifiedContent.trim().slice(0, -3);
          }
        }

        // Remove IIFE wrapper
        if (modifiedContent.includes('\n(function () {')) {
          modifiedContent = modifiedContent.replace(/\(function \(\) \{/, '');

          // Remove matching closing parentheses
          if (modifiedContent.trim().endsWith('}());')) {
            modifiedContent = modifiedContent.trim().slice(0, -5);
          }

          // Clean up any leftover unmatched brackets
          // removing function wrapper leads to an unmatched '}' and ')'
          // this logic just removes the unmatched brackets. 
          let bracketCount = 0;
          for (let indx = 0; indx < modifiedContent.length; indx++) {
            if (modifiedContent[indx] === '{') {
              bracketCount++;
            } else if (modifiedContent[indx] === '}') {
              bracketCount--;
              if (bracketCount < 0) {
                let tempIndx = indx;
                while (modifiedContent[indx] && modifiedContent[indx] !== ')') {
                  indx--;
                }
                modifiedContent = modifiedContent.slice(0, indx) + modifiedContent.slice(tempIndx + 1);
                bracketCount++;
                break;
              }
            }
          }
        }

        // Write modified content back to file
        fs.writeFileSync(filePath, modifiedContent, 'utf8');
      } catch (error) {
        console.error(`Error processing file ${file}: ${error.message}`);
      }
    }
  });
}

/**
 * Recursively removes empty directories.
 * while searching for @ INCLUDE_IN_API_DOCS file, some temporary directories are created. Deleting them. 
 * @param {string} dir - Directory to clean up
 */
function removeEmptyDirectories(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      removeEmptyDirectories(filePath);

      // Remove directory if it's empty
      if (fs.readdirSync(filePath).length === 0) {
        fs.rmdirSync(filePath);
      }
    }
  });
}

processFilesRecursively(inputDir, inputDir);
console.log("All script files for the API documentation have been generated!");

removeEmptyDirectories(outputDir);
console.log("Successfully removed all the empty directories");

removeRequireJSCode(outputDir);
console.log("Successfully removed redundant JS code");



// Conversion of MDX from JS files starts here

// Set up paths for the build process
const buildDir = __dirname;
const jsdocFile = path.join(buildDir, 'jsdoc.json');
const configFile = path.join(buildDir, 'config.json');
const sourceDir = path.join(buildDir, 'dev-temp');
const devApiDir = path.join(buildDir, 'dev-api');
const tempDir = path.join(devApiDir, 'temp');
const mdxApiDir = path.join(__dirname, 'api');


/**
 * Generates MDX files from JS files using jsdoc-to-mdx.
 * This is the main function that orchestrates the MDX generation process.
 */
function generateMdxFiles() {
  try {
    // Create necessary directories (all these directories will be removed automatically after the task is completed. Finally after the whole execution we'll be left with just the API directory i.e. mdxApiDir)
    [devApiDir, tempDir, mdxApiDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Read JSDoc and config files
    let jsdocConfig = readJsdocFile();
    let config = readConfigFile();

    // Modify JSDoc config to use temp directory
    jsdocConfig.source.include = [path.relative(buildDir, tempDir)];
    fs.writeFileSync(jsdocFile, JSON.stringify(jsdocConfig, null, 2));

    // Copy JS files to dev-api directory
    copyJsFiles(sourceDir, devApiDir);

    // Process each JS file
    const jsFiles = getJsFiles(devApiDir);
    for (const file of jsFiles) {
      processJsFile(file, config);
    }

    // Post-processing of MDX files
    processMdxFiles(mdxApiDir);

    // Clean up temporary files and directories
    cleanupTempFiles();

    console.log('MDX generation and processing completed successfully.');
  } catch (error) {
    console.error('Error generating or processing MDX files:', error);
  }
}

/**
 * Reads JSDoc configuration file.
 * @returns {Object} JSDoc configuration object
 */
function readJsdocFile() {
  if (fs.existsSync(jsdocFile)) {
    return JSON.parse(fs.readFileSync(jsdocFile, 'utf-8'));
  } else {
    console.error("Jsdoc.json not found! Make sure it is inside the same directory as of the script!");
  }
}

/**
 * Reads the configuration file.
 * @returns {Object} Configuration object
 */
function readConfigFile() {
  if (fs.existsSync(configFile)) {
    return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } else {
    console.error("Config.json not found! Make sure it is inside the same directory as of the script!");
  }
}

/**
 * Copies JS files from source to destination directory.
 * 
 * @param {string} source - Source directory
 * @param {string} destination - Destination directory
 */
function copyJsFiles(source, destination) {
  const entries = fs.readdirSync(source, { withFileTypes: true });

  entries.forEach(entry => {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyJsFiles(srcPath, destPath);
    } else if (path.extname(entry.name) === '.js') {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

/**
 * Recursively gets all JS files in a directory.
 * 
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of file paths
 */
function getJsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (path.extname(fullPath) === '.js') {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Processes a single JS file to generate MDX.
 * It processes one JS file at a time, as one JS file may create multiple MDX files, so after creating, we need to merge all the MDX files created a single JS file.
 * 
 * @param {string} file - Path to the JS file
 * @param {Object} config - Configuration object
 */
function processJsFile(file, config) {
  const relativeDir = path.dirname(path.relative(devApiDir, file));
  const fileName = path.basename(file, '.js');

  // Copy JS file to temp directory
  fs.copyFileSync(file, path.join(tempDir, path.basename(file)));

  // Set unique outDir for this file
  const outDir = path.join(mdxApiDir, relativeDir, fileName);
  config.outDir = path.relative(__dirname, outDir);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  // Run jsdoc-to-mdx
  execSync(`npx jsdoc-to-mdx -c ${path.relative(__dirname, configFile)}`, { cwd: __dirname });

  console.log(`${path.basename(file)} is successfully converted to MDX`);

  // Merge generated MDX files
  mergeMdxFiles(outDir, `${fileName}.mdx`, path.join(mdxApiDir, relativeDir));

  // Clean up temp file
  fs.unlinkSync(path.join(tempDir, path.basename(file)));
}


/**
 * Merges multiple MDX files into a single file.
 * Multiple MDX files are generated from a single JS file, so we need to merge all the generated MDX files into a single MDX file
 * 
 * @param {string} dir - Directory containing MDX files
 * @param {string} outputFileName - Name of the output file
 * @param {string} finalDir - Directory to save the merged file
 */
function mergeMdxFiles(dir, outputFileName, finalDir) {
  const mdxFiles = fs.readdirSync(dir).filter(file => path.extname(file) === '.mdx');
  let mergedContent = '';

  for (const file of mdxFiles) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    mergedContent += content + '\n\n';
  }

  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }

  const outputPath = path.join(finalDir, outputFileName);

  // Append to existing file if it exists
  if (fs.existsSync(outputPath)) {
    const existingContent = fs.readFileSync(outputPath, 'utf-8');
    mergedContent = existingContent + '\n\n' + mergedContent;
  }

  fs.writeFileSync(outputPath, mergedContent);

  // Clean up temporary directory
  fs.rmSync(dir, { recursive: true, force: true });
}


/**
 * Processes all MDX files in a directory.
 * 
 * @param {string} dir - Directory containing MDX files
 */
function processMdxFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processMdxFiles(fullPath);
    } else if (path.extname(entry.name) === '.mdx') {
      processOneMdxFile(fullPath, dir, entry.name);
    }
  }
}


/**
 * Processes a single MDX file.
 * This function removes non-essentail details from the MDX file.
 * Adds Import section at the top of the files
 * Creates headings (Members, Methods, Properties) and move the content inside their respective headings
 * 
 * @param {string} filePath - Path to the MDX file
 * @param {string} dir - Directory containing the file
 * @param {string} fileName - Name of the file
 */
function processOneMdxFile(filePath, dir, fileName) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Escape curly braces
  content = content.replace(/\{/g, '\\{');

  // Remove custom_edit_url lines
  content = content.replace(/---\s*custom_edit_url:\s*null\s*---/g, '');

  // Add import statement
  const directoryName = path.basename(dir);
  const fileNameWithoutExt = path.basename(fileName, '.mdx');
  const importStatement = `### Import :\n\n\`\`\`\nbrackets.getModule("${directoryName}/${fileNameWithoutExt}")\n\`\`\`\n\n`;

  // Organize content into sections
  const sections = {
    methods: [],
    properties: [],
    others: []
  };

  const blocks = content.split(/(?=```ts)/);

  blocks.forEach(block => {
    if (block.includes('```ts\nfunction')) {
      sections.methods.push(processBlock(block, 'function'));
    } else if (block.includes('```ts\nconst')) {
      sections.properties.push(processBlock(block, 'const'));
    } else {
      sections.others.push(processBlock(block, ''));
    }
  });

  // Reconstruct the content
  let newContent = importStatement;
  if (sections.methods.length > 0) {
    newContent += '## METHODS\n\n' + sections.methods.join('\n\n');
  }
  if (sections.properties.length > 0) {
    newContent += '\n\n## PROPERTIES\n\n' + sections.properties.join('\n\n');
  }
  if (sections.others.length > 0) {
    newContent += '\n\n## OTHER MEMBERS\n\n' + sections.others.join('\n\n');
  }

  // Remove all backticks and clean up 'ts' leftovers
  newContent = removeBackticksAndCleanup(newContent);

  fs.writeFileSync(filePath, newContent);
}


/**
 * Processes a block of MDX content.
 * Creates subheadings for the functions, constructors and other members
 * 
 * @param {string} block - Block of MDX content
 * @param {string} type - Type of block (function, const, or empty string)
 * @returns {string} Processed block
 */
function processBlock(block, type) {
  const lines = block.split('\n');
  const declarationLine = lines.findIndex(line => line.startsWith('```ts'));

  if (declarationLine !== -1) {
    if (type) {
      const match = lines[declarationLine + 1].match(new RegExp(`${type}\\s+([^(]+)`));
      if (match) {
        const name = match[1].trim();
        lines[declarationLine + 1] = lines[declarationLine + 1].replace(`${type} ${name}`, `### ${name}`);
      }
    }
    // Remove the ```ts line
    lines.splice(declarationLine, 1);
  }

  return lines.join('\n');
}


/**
 * Removes backticks and cleans up 'ts' leftovers in MDX content.
 * 
 * @param {string} content - MDX content to clean up
 * @returns {string} Cleaned up content
 */
function removeBackticksAndCleanup(content) {
  // Remove all backticks
  content = content.replace(/```/g, '');

  // Remove 'ts' at the beginning of a line or after a newline character
  content = content.replace(/(\n|^)ts\s*/g, '$1');

  return content;
}


/**
 * Cleans up temporary files and directories created during the MDX generation process.
 * This leaves us with just the API directory
 */
function cleanupTempFiles() {
  // Remove temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Remove dev-api directory
  if (fs.existsSync(devApiDir)) {
    fs.rmSync(devApiDir, { recursive: true, force: true });
  }

  // Remove source directory
  if (fs.existsSync(sourceDir)) {
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
}


// Start the MDX generation process
generateMdxFiles();

console.log("Redundant files generated for conversion process are removed!");

// Root directories
const docsDir = './docs';

/**
 * Copies markdown files from the docs directory to the API directory.
 *
 * @param {string} sourceDir - Source directory containing markdown files
 * @param {string} destDir - Destination directory for copied files
 */
const copyMarkdownFiles = (sourceDir, destDir) => {
  // Create the destination directory if it doesn't exist
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.readdirSync(sourceDir).forEach((file) => {
    const sourcePath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);
    const stat = fs.lstatSync(sourcePath);

    // Only copy if it's a file and has .md extension
    if (stat.isFile() && path.extname(sourcePath) === '.md') {
      fs.copyFileSync(sourcePath, destPath);
    }
  });
};

// Execute the function
copyMarkdownFiles(docsDir, mdxApiDir);


const eventManagerPath = './build/api/utils/EventManager.mdx';
const notificationUIPath = './build/api/widgets/NotificationUI.mdx';


/**
 * Function to fix all <extensionName> tags from the EventManager.mdx file as Docusaurus doesn't validate it and throws error
 * removing links where docusaurus throws error. 
 * @param {string} filePath
 */
function fixEventManagerFile(filePath) {
  try {
    // Read the file content
    let content = fs.readFileSync(filePath, 'utf8');

    // Use a regular expression to find and remove all <extensionName> tags
    let updatedContent = content.replace(/<extensionName>/g, '<extensionName />');

    updatedContent = updatedContent.replace('[&quot;http://mydomain.com&quot;]=true;', '');

    updatedContent = updatedContent.replace('["http://mydomain.com"]', '');

    // Write the updated content back to the file
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log("Successfully fixed all issues inside eventManager file");
  } catch (error) {
    console.error(`Error processing file ${filePath}: ${error.message}`);
  }
}


/**
 * fix notification UI broken areas
 * NotificationUI file has some issues and mdx is not being rendered properly. Fixing it.
 * Removing a line where docusaurus throws error
 * Removing </br> tag that's within div tag. Only two instances of this in whole project, so fixing it by searching for the exact line instead of writing a logic (as the logic may disturb content from other files)
 * @param {string} filePath
 */
function fixNotificationUiFile(filePath) {
  try {
    // Read the file synchronously
    let content = fs.readFileSync(filePath, 'utf8');

    let updatedContent = content;

    // Fix notification UI broken areas
    updatedContent = updatedContent.replace('ame="badge badge--info margin-left--sm">static</span><br/><a href="#done">done</a><span className="badge badge--info margin-left--sm">static</span></div></div>\n</div>', '');

    updatedContent = updatedContent.replace('Click me to </br>locate the file in file tree', 'Click me to locate the file in file tree');
    
    // Replace second occurrence
    updatedContent = updatedContent.replace('Click me to </br>locate the file in file tree', 'Click me to locate the file in file tree');

    // Write the file synchronously
    fs.writeFileSync(filePath, updatedContent, 'utf8');

    console.log("Successfully fixed all issues inside notificationUI file");
  } catch (err) {
    console.error('Error:', err);
  }
}

fixEventManagerFile(eventManagerPath);
fixNotificationUiFile(notificationUIPath);


/**
 * Moves all MDX files and subfolders to a specified destination folder.
 * @param {string} sourceDir - The source directory containing MDX files and folders
 * @param {string} destDir - The destination directory for API reference
 */
function moveToApiReference(sourceDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // Skip the "API reference" folder itself
      if (entry.name === "API reference") continue;
      
      // Create the corresponding directory in the destination
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      
      // Move contents of the directory
      moveToApiReference(srcPath, destPath);
      
      // Remove the now-empty directory from the source
      if (fs.readdirSync(srcPath).length === 0) {
        fs.rmdirSync(srcPath);
      }
    } else if (path.extname(entry.name) === '.mdx') {
      // If it's an MDX file, move it
      fs.renameSync(srcPath, destPath);
    }
  }
}

const apiReferenceDir = path.join(__dirname, 'api', 'API reference');
moveToApiReference(path.join(__dirname, 'api'), apiReferenceDir);
console.log("All MDX files have been moved to the API reference folder");

console.log("All set! Just move the API folder to the docs site");