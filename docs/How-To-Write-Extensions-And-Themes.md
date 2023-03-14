This document outlines how to write your own extensions and themes for Phoenix Code.

# Quick Start
Click on one of the below links and follow the instructions there to start:
* [Create a theme](https://github.com/phcode-dev/theme-template)
* [Create an extension](https://github.com/phcode-dev/extension-template)

# API docs
This is an evolving document, please refer the below links for extension API docs and how tos.
* Phoenix APIs - https://github.com/phcode-dev/phoenix/wiki#phoenix-api-docs
  * This is a work in progress. As we improve our documentation for phcode.dev, please check out the Brackets API docs too. 
* Brackets APIs are also supported- https://brackets.io/docs/current/
* Common How-Tos: https://github.com/brackets-cont/brackets/wiki/How-to-Write-Extensions#common-how-tos
* Take a look at our default extensions for code reference: https://github.com/phcode-dev/phoenix/tree/main/src/extensions/default


# Publishing to the extension/theme store
Extensions created from the above GitHub template can be easily published from your GitHub repo to the store.

Just creating a release in GitHub with an attached `extensions.zip` file. Follow the below steps:

1. Update `package.json` file before publishing
   * increment the `version` field.
   * Ensure that the `name` field is correct and all other fields like `title` and `description` are updated.
1. Compress the extension folder into a zip file with name `extension.zip`. **NB: It is important to name the file as exactly `extension.zip`**
1. Create a new release in GitHub and attach the above `extension.zip` file in the release. [See how to create GitHub releases by following this link](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
   > See Release Eg. https://github.com/phcode-dev/extension-template/releases/tag/0.0.1
1. You will get an issue in your issue tab regarding the publishing status of the extension/theme.
   > See Eg. https://github.com/phcode-dev/extension-template/issues/2
1. If there are any errors in publishing, please visit the link in the issue to 
fix and retry publishing the release.
1. Once the extension is published, you should be able to see it in the extension store in https://phcode.dev
![image](https://user-images.githubusercontent.com/5336369/224892317-c55ddec2-599e-4df2-8ee5-4e50f262dee7.png)
 
> NB: Your repository must be **public** to be able to be published to the Phoenix Extension store.
See this link on [understanding how to change repo visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility#changing-a-repositorys-visibility) to public in GitHub.

> The `verified` extension badge(tick mark) will be automatically granted to verified GitHub Organizations.

## Publishing legacy Brackets extensions
To publish Extensions/themes that are not created from the above template
or old Brackets extensions, please follow the below steps:

1. Create a GitHub repo for your extension if it is not present.
2. Create a file `.github/workflows/publishToPhcode.yml` in your repo with the following contents: https://github.com/phcode-dev/theme-template/blob/main/.github/workflows/publishToPhcode.yml

That's all, you can now follow the above `Publishing to the extension/theme store` section as with the template extension.
