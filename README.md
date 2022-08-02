# Welcome to Phoenix!

**Website: https://phcode.dev**

Phoenix is a modern open-source and free code editor for the web, built for the browser.

#### Code Guardian
[![Phoenix build verification](https://github.com/phcode-dev/phoenix/actions/workflows/build_verify.yml/badge.svg)](https://github.com/phcode-dev/phoenix/actions/workflows/build_verify.yml)

<a href="https://sonarcloud.io/summary/new_code?id=aicore_phoenix">
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=alert_status" alt="Sonar code quality check" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=security_rating" alt="Security rating" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=vulnerabilities" alt="vulnerabilities" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=coverage" alt="Code Coverage" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=bugs" alt="Code Bugs" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=reliability_rating" alt="Reliability Rating" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=sqale_rating" alt="Maintainability Rating" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=ncloc" alt="Lines of Code" />
  <img src="https://sonarcloud.io/api/project_badges/measure?project=aicore_phoenix&metric=sqale_index" alt="Technical debt" />
</a>
<a href="https://www.npmjs.com/package/git-commit-msg-linter">
  <img src="https://badgen.net/badge/git-commit-msg-linter/3.0.0/green" alt="commit msg linted by git-commit-msg-linter" />
</a>

Phoenix is in early alpha.  
* Please subscribe to our [notification list](https://core.ai/) to get notified when Phoenix goes live. 

![Phoenix](./phoenix.png)

## Tenets
1. Targeted for web development. Js, html and CSS enjoy special status.
2. Light-weight editor.
3. Extension support maintaining full compatibility with Brackets extensions (except brackets-node extensions).
4. Uncompromised local development experience.
5. Support for pluggable remote back-ends.
6. Phoenix core will work from a static web server.
7. Source code in release builds will always be auditable and readable from dev-tools.

AGPL/Libre license guards your right to audit and change code that handles your data.
Phoenix usually loads up in under one second and loading it faster at the expense of making it hard
to read and develop is a noop. We prioritize simplicity and eaze of development. 

## Status
Phoenix is in alpha and is under active development.
* [Phoenix Alpha development status](https://github.com/phcode-dev/phoenix/issues/11).

## Contributing/ Feedback
* [Get in touch with our community](https://github.com/phcode-dev/phoenix/discussions).
* [Request a new feature](https://github.com/phcode-dev/phoenix/discussions/categories/ideas)
* [Join our Discord community](https://discord.com/invite/rBpTBPttca)
* [Raise issues](https://github.com/phcode-dev/phoenix/issues)
* [Contribute](https://github.com/phcode-dev/phoenix)

## Building Phoenix
[Source Repository](https://github.com/phcode-dev/phoenix) 

* Install gulp globally once.  `npm install -g gulp-cli` (use **sudo** in *nix systems)
* run `npm install`
* To build after npm install: `npm run build`

## Running phoenix
* run `npm run serve` in the terminal.
  * NB: To test Phoenix from an external mobile or machine, use `npm run serveExternal` instead of `serve`   
* Use chrome/edge browser to navigate to [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

## IDE Setup
SonarLint static code analysis checker is not yet available as a Brackets
extension. Use sonarLint plugin for webstorm or any of the available
IDEs from this link before raising a pull request: https://www.sonarlint.org/

## Building Release artifacts

* run `npm install`
* To build the release artifacts: `npm run release`
* The release artifacts to host will be in `dist` folder.

## Running tests
* run `npm run test` in the terminal.
  * NB: this will setup all the required files for test 
* Use chrome/edge browser to navigate to Phoenix[http://localhost:8000/src/index.html](http://localhost:8000/src/index.html)
* In Phoenix Menu, select `Debug > run Tests` To open the test runner.
* Run tests as required. 
  * NB: To reset test data files, click on `reset and reload tests` option in the test runner.

### Running tests in dev staging and prod stacks
* To run tests against these stacks go to the following url: 
* dev: https://dev.phcode.dev/test/SpecRunner.html
* staging: https://staging.phcode.dev/test/SpecRunner.html
* prod: https://phcode.dev/test/SpecRunner.html

## Browsing the virtual file system
To view/edit the files in the browser virtual file system in Phoenix:
`debug menu> Open Virtual File System`

## Clean and reset builds
* clean builds only: `npm run clean`
* Reset everything including node modules: `npm run reset`

## Deployment to phcore.dev
* All changes pushed to the main branch are automatically published to https://dev.phcode.dev
* To publish the changes to https://staging.phcode.dev , push changes to the `staging` branch in this repo with a pull request.
* Once the changes are validated and tested, trigger a prod deployment by pushing to the `prod` branch.

Note: Pre-prod is still work in progress.

## Acknowledgements
* Phoenix is based on the Brackets code editor by Adobe. Find out more on [Adobe Brackets here](https://github.com/adobe/brackets/).
* Our main code editor library https://codemirror.net/
* Inspired by previous work from the [Mozilla Thimble](https://github.com/mozilla/thimble.mozilla.org) project to port brackets to the web. https://github.com/mozilla/brackets
* In browser server based on [nohost](https://github.com/humphd/nohost) by https://github.com/humphd/


## License
Discussion: https://github.com/phcode-dev/phoenix/issues/184

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

