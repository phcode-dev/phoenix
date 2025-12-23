# Welcome to Phoenix!

**Website: https://phcode.io**

Phoenix is a modern open-source and [free software](https://www.gnu.org/philosophy/free-sw.en.html) text editor
designed to make coding as simple and fun as playing a video game.

#### Code Guardian
[![Phoenix build verification](https://github.com/phcode-dev/phoenix/actions/workflows/build_verify.yml/badge.svg)](https://github.com/phcode-dev/phoenix/actions/workflows/build_verify.yml)

<a href="https://sonarcloud.io/summary/new_code?id=phcode-dev_phoenix">
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=alert_status" alt="Sonar code quality check" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=security_rating" alt="Security rating" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=vulnerabilities" alt="vulnerabilities" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=coverage" alt="Code Coverage" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=bugs" alt="Code Bugs" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=reliability_rating" alt="Reliability Rating" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=sqale_rating" alt="Maintainability Rating" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=ncloc" alt="Lines of Code" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=phcode-dev_phoenix&metric=sqale_index" alt="Technical debt" />
</a>
<a href="https://www.npmjs.com/package/git-commit-msg-linter">
  <img src="https://badgen.net/badge/git-commit-msg-linter/3.0.0/green" alt="commit msg linted by git-commit-msg-linter" />
</a>

##### Error and App stability monitoring powered by
<a href="https://www.bugsnag.com/">
<img src="https://assets-global.website-files.com/607f4f6df411bd01527dc7d5/63bc40cd9d502eda8ea74ce7_Bugsnag%20Full%20Color.svg" alt="bugsnag" style="width:200px;"/>
</a>

#### Development status:  Stable/Active.

![Screenshot from 2022-09-20 13-35-03](https://user-images.githubusercontent.com/5336369/191202975-6069d270-526a-443d-bd76-903353ae1222.png)

## Tenets
1. Targeted for web development. Js, html and CSS enjoy special status.
2. Game UX - Approach code editing like a game that a school kid would play after skipping the tutorial.
2. Light-weight editor.
3. Extension support maintaining full compatibility with Brackets extensions (except brackets-node extensions).
4. Uncompromised local development experience.
5. Support for pluggable remote back-ends.
6. Phoenix core will work from a static web server.
7. Compile step less build process. Code changes in phoenix do not need to be recompiled for most cases for development. 
8. Prioritize simplicity and ease of development. 

## Contributing/ Feedback
* [Get in touch with our community](https://github.com/phcode-dev/phoenix/discussions).
* [Request a new feature](https://github.com/phcode-dev/phoenix/discussions/categories/ideas)
* [Join our Discord community](https://discord.com/invite/rBpTBPttca)
* [Raise issues](https://github.com/phcode-dev/phoenix/issues)
* [Contribute](https://github.com/phcode-dev/phoenix)

## Building Phoenix
[Source Repository](https://github.com/phcode-dev/phoenix) 

* Install gulp globally once. 
  * In Mac/Linux: `sudo npm install -g gulp-cli`
  * In Windows: `npm install -g gulp-cli`
* run `npm install`
* To build after npm install: 
  * `npm run build` - generate builds close to release builds locally.
  * or `npm run build:debug` to build debug builds for development with more debug symbols.

## Running phoenix
* run `npm run serve` in the terminal.
* Use chrome/edge browser to navigate to [http://localhost:8000/src](http://localhost:8000/src)

## IDE Setup
SonarLint static code analysis checker is not yet available as a Brackets
extension. Use sonarLint plugin for webstorm or any of the available
IDEs from this link before raising a pull request: https://www.sonarlint.org/

## Building Release artifacts

* run `npm install`
* To build the release artifacts, run one of the following commands depending on what build you want:
  * `npm run release:dev`, `npm run release:staging`, `npm run release:prod`
* The release artifacts to host will be in `dist` folder.

## Running and debugging tests in browser
This is the easiest and preferred way to run Phoenix tests.
* run `npm run build` in the terminal.
  * NB: this will setup all the required files for test 
* Use chrome/edge browser to navigate to Phoenix[http://localhost:8000/src/index.html](http://localhost:8000/src/index.html)
* In Phoenix Menu, select `Debug > Phoenix Code Diagnostic Tools > Run Phoenix Code Tests` To open the test runner.
* Run tests as required. 
  * NB: To reset test data files, click on `reset and reload tests` option in the test runner.
* You can use the browser dev tools to debug. 

## Running and debugging tests in playwright headless mode or in GitHub Actions
We use [Playwright](https://playwright.dev/) to run the headless version of our tests.
Please note that we do not use Playwright as our actual test framework, but as a headless browser(chrome and firefox)
to run our tests written in Jasmine/Mocha.
* run `npm run test<*>` in the terminal to run the unit tests run in GitHub actions. Eg. `npm run testChromium`.
* To debug the tests, `npm run test<*>Debug`. Eg. `npm run testFirefoxDebug`. However, we recommend using the
above `Running tests in browser` section to actually fix/debug tests that are failing in the pipeline.
It has much better debug UX and fixing it directly in the browser will almost certainly fix it in playwright.
* To run integration tests use command: `npx cross-env TEST_ENV=<integration suite name> npm run test<*>`
  * The allowed integration test suite names are: `integration, LegacyInteg, mainview, livepreview`.
    You can get these suite names from the test runner.
  * Eg: `npx cross-env TEST_ENV=integration npm run testChromium`
* To debug integration tests use command: ` npx cross-env TEST_ENV=<integration suite name> npm run test<*>Debug`
  * Eg: `npx cross-env TEST_ENV=mainview npm run testChromiumDebug` 

### Running tests in dev staging and prod stacks in playwright
#### To run tests against these stacks locally, follow these steps:
1. Build the release using `npm run release:<stage>`. Eg: `npm run release:dev`
2. Run the unit tests using format: `npm run test<*>Dist`. Eg. `npm run testChromiumDist`.
3. Run the integration tests using the format: `npx cross-env TEST_ENV=<integration suite name> npm run test<*>Dist`. Eg. `npx cross-env TEST_ENV=mainview npm run testChromiumDist`.
 
#### To run tests against these dev/staging/prod in the browser
1. Build the release using `npm run release:<stage>`. Eg: `npm run release:dev`
2. Run `npm run serve` to start the server.
3. Go to `http://localhost:8000/dist-test/test/SpecRunner.html` in the browser to run tests that was built for the stage above.

## Browsing the virtual file system
To view/edit the files in the browser virtual file system in Phoenix:
`debug menu> Open Virtual File System`

## Clean and reset builds
* clean builds only: `npm run clean`

## Acknowledgements
* Phoenix is based on the Brackets code editor by Adobe. Find out more on [Adobe Brackets here](https://github.com/adobe/brackets/).
* Our main code editor library https://codemirror.net/
* Inspired by previous work from the [Mozilla Thimble](https://github.com/mozilla/thimble.mozilla.org) project to port brackets to the web. https://github.com/mozilla/brackets
* In browser server based on [nohost](https://github.com/humphd/nohost) by https://github.com/humphd/

## License
GNU AGPL-3.0 License

Copyright (c) 2021 - present Core.ai
Based on Backets, Copyright (c) 2012 Adobe Systems Incorporated and the brackets.io community

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see https://opensource.org/licenses/AGPL-3.0.

