/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2022 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/* eslint-env node */

const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

/**
 * Conditionally clones the phoenix-pro repository if environment variables are set.
 *
 * Behavior:
 * - If env vars not set: Skip clone, build continues (community builds)
 * - If env vars set but clone fails: Build FAILS (credentials configured but clone failed)
 * - If directory exists with correct commit: Skip clone, build continues
 * - If directory exists with wrong commit: Log warning, build continues (respect local changes)
 */
function clonePhoenixProRepo() {
    return new Promise((resolve, reject) => {
        // this is only expected to be hit in github actions environment.
        // in normal builds, we will bail out as soon as we detect that the environmental vars are note present.

        const proRepoUrl = process.env.PRO_REPO_URL;
        const proRepoToken = process.env.PRO_REPO_ACCESS_TOKEN;
        const targetDir = path.resolve(__dirname, '../src/extensionsIntegrated/phoenix-pro');

        // Check if repository URL is set
        if (!proRepoUrl) {
            // this si what will happen in most dev builds.
            console.log('Skipping phoenix-pro clone: PRO_REPO_URL not set');
            console.log('This is expected for community builds');
            resolve();
            return;
        }

        if (!proRepoToken) {
            console.warn('PRO_REPO_ACCESS_TOKEN not set, will attempt clone without authentication');
        }

        // all code below is only likely to be executed in the ci environment

        // Check if directory already exists
        if (fs.existsSync(targetDir)) {
            console.log('phoenix-pro directory already exists at:', targetDir);

            // Check if it's a git repository
            const gitDir = path.join(targetDir, '.git');
            if (fs.existsSync(gitDir)) {
                try {
                    // Verify current commit
                    const trackingRepos = require('../tracking-repos.json');
                    const expectedCommit = trackingRepos.phoenixPro.commitID;
                    const currentCommit = execSync('git rev-parse HEAD', {
                        cwd: targetDir,
                        encoding: 'utf8'
                    }).trim();

                    if (currentCommit === expectedCommit) {
                        console.log(`✓ phoenix-pro is already at the correct commit: ${expectedCommit}`);
                        resolve();
                        return;
                    } else {
                        // this code will only reach in ci envs with teh env variables, so ward if the commit
                        // is not what we expect.
                        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        console.error(`Error: phoenix-pro is at commit ${currentCommit.substring(0, 8)}`);
                        console.error(`         but tracking-repos.json specifies ${expectedCommit.substring(0, 8)}`);
                        console.error('Not building incorrect binary.');
                        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        reject();
                        return;
                    }
                } catch (error) {
                    console.error(`Error: Could not verify phoenix-pro commit: ${error.message}`);
                    console.error('Not building incorrect binary.');
                    reject();
                    return;
                }
            } else {
                console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.warn('Error: phoenix-pro directory exists but is not a git repository');
                console.error('Not building incorrect binary as it could not be verified.');
                console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                reject();
                return;
            }
        }

        // Perform the clone operation
        try {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Cloning phoenix-pro repository...');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Load target commit from tracking-repos.json
            const trackingRepos = require('../tracking-repos.json');
            const commitID = trackingRepos.phoenixPro.commitID;
            console.log(`Target commit: ${commitID}`);

            // Construct authenticated URL if token is available
            const authUrl = proRepoToken
                ? proRepoUrl.replace('https://', `https://oauth2:${proRepoToken}@`)
                : proRepoUrl;

            // Step 1: Shallow clone
            console.log('Step 1/3: Cloning repository (shallow clone)...');
            execSync(`git clone --depth 1 "${authUrl}" "${targetDir}"`, {
                stdio: ['pipe', 'pipe', 'inherit'] // Hide stdout (may contain token), show stderr
            });
            console.log('✓ Clone completed');

            // Step 2: Fetch specific commit
            console.log(`Step 2/3: Fetching specific commit: ${commitID}...`);
            try {
                execSync(`git fetch --depth 1 origin ${commitID}`, {
                    cwd: targetDir,
                    stdio: ['pipe', 'pipe', 'inherit']
                });
                console.log('✓ Fetch completed');
            } catch (fetchError) {
                // Commit might already be in shallow clone
                console.log('  (Commit may already be present in shallow clone)');
            }

            // Step 3: Checkout specific commit
            console.log(`Step 3/3: Checking out commit: ${commitID}...`);
            execSync(`git checkout ${commitID}`, {
                cwd: targetDir,
                stdio: ['pipe', 'pipe', 'inherit']
            });
            console.log('✓ Checkout completed');

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('✓ Successfully cloned and checked out phoenix-pro repository');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            resolve();

        } catch (error) {
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('✗ ERROR: Failed to clone phoenix-pro repository');
            console.error(`Error: ${error.message}`);
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('Build failed because:');
            console.error('  - PRO_REPO_URL is set (phoenix-pro expected)');
            console.error('  - Clone operation failed');
            console.error('');
            console.error('Possible causes:');
            console.error('  - Invalid or expired access token');
            console.error('  - Insufficient token permissions (needs "repo" scope)');
            console.error('  - Network connectivity issues');
            console.error('  - Repository URL is incorrect');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Clean up partial clone if it exists
            if (fs.existsSync(targetDir)) {
                try {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                    console.log('Cleaned up partial clone directory');
                } catch (cleanupError) {
                    console.warn(`Could not clean up partial clone: ${cleanupError.message}`);
                }
            }

            reject(new Error('Failed to clone phoenix-pro repository')); // FAIL BUILD
        }
    });
}

/**
 * Generates a JSON file with phoenix-pro build information including the commit ID.
 * Only generates if the phoenix-pro folder exists.
 * If the phoenix-pro directory is not a git repository, the commit ID will be "unknown".
 */
function generateProBuildInfo() {
    return new Promise((resolve) => {
        const phoenixProPath = path.resolve(__dirname, '../src/extensionsIntegrated/phoenix-pro');

        // Only generate if phoenix-pro folder exists
        if (!fs.existsSync(phoenixProPath)) {
            console.log('Phoenix Pro folder not found, skipping buildInfo.json generation');
            resolve();
            return;
        }

        const gitPath = path.join(phoenixProPath, '.git');
        let commitID = "unknown";

        if (fs.existsSync(gitPath)) {
            try {
                commitID = execSync('git rev-parse --short HEAD', {
                    cwd: phoenixProPath,
                    encoding: 'utf8'
                }).trim();
                console.log(`Phoenix Pro commit ID: ${commitID}`);
            } catch (error) {
                console.warn('Could not get phoenix-pro commit ID:', error.message);
                commitID = "unknown";
            }
        } else {
            console.log('Phoenix Pro is not a git repository, using "unknown" for commit ID');
        }

        const buildInfo = {
            phoenixProCommitID: commitID
        };

        const buildInfoPath = path.join(phoenixProPath, 'proBuildInfo.json');
        fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));

        console.log('Generated phoenix-pro/proBuildInfo.json');
        resolve();
    });
}

// Export the functions
exports.clonePhoenixProRepo = clonePhoenixProRepo;
exports.generateProBuildInfo = generateProBuildInfo;
