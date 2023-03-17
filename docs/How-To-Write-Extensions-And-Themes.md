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

1. Increment the `version` field in `package.json` file before publishing. 
1. Compress the extension folder into a zip file with name `extension.zip`. **NB: It is important to name the file as exactly `extension.zip`** ![image](https://user-images.githubusercontent.com/5336369/225952199-64a94252-d87c-4e6d-9e0f-92dadcd91a22.png)
1. Create a new release in GitHub and attach the above `extension.zip` file in the release.
   1. On GitHub.com, navigate to the main page of the repository.
   2. To the right of the list of files, click `Releases`. ![image](https://user-images.githubusercontent.com/5336369/225949727-615f1e47-6bef-4588-a2ad-8ff171a365f2.png)
   3. Click on `Draft New Release` ![image](https://user-images.githubusercontent.com/5336369/225950622-7a2be0c7-50ae-492b-9c4b-0e7561a5d6db.png)
   4. Select `choose a tag` and type in your new extension version and `Create new tag`. ![image](https://user-images.githubusercontent.com/5336369/225951176-de9fefa2-8460-4a1d-a655-906e8f6f66ee.png)
   5. Fill out the remaining fields.
   6. Drag and drop the `extension.zip` file to the release. ![new extension](https://user-images.githubusercontent.com/5336369/225951658-ac388712-0128-463e-85cf-c66746a360f7.gif)
   7. Click on `Publish release` button.
   >    See Release Example: https://github.com/phcode-dev/extension-template/releases/tag/0.0.1
1. You will get an issue in your issue tab regarding the publishing status of the extension/theme.
   > See Example: https://github.com/phcode-dev/extension-template/issues/2
1. If there are any errors in publishing, please visit the link in the issue to 
see the errors. Fix and `retry` publishing the release.
   ![image](https://user-images.githubusercontent.com/5336369/222446467-534f67de-5342-444a-bba5-708011e7024d.png)
1. Once the extension is published, you should be able to see it in the extension store in https://phcode.dev
![image](https://user-images.githubusercontent.com/5336369/224892317-c55ddec2-599e-4df2-8ee5-4e50f262dee7.png)

## Publishing legacy Brackets extensions
> Follow this section only for old brackets extensions.

To publish Extensions/themes that are not created from the above [theme](https://github.com/phcode-dev/theme-template) and [extension](https://github.com/phcode-dev/extension-template) template
or old Brackets extensions, please follow the below steps:

1. Create a GitHub repo for your extension if it is not present.
2. Create a file `.github/workflows/publishToPhcode.yml` in your repo with the following contents: https://github.com/phcode-dev/theme-template/blob/main/.github/workflows/publishToPhcode.yml

That's all, you can now follow the above `Publishing to the extension/theme store` section.

## FAQ
### Why is my extension is not being published?
Your repository must be **public** to be able to be published to the Phoenix Extension store.
See this link on [understanding how to change repo visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility#changing-a-repositorys-visibility) to public in GitHub.

### How do i get a Verified Badge for my extension?
The `verified` extension badge(tick mark) will be automatically granted to verified GitHub Organizations.

### How do i delete my extension from the store
Please raise an issue here: https://github.com/phcode-dev/phoenix/issues/new/choose , mention your extension repository.

