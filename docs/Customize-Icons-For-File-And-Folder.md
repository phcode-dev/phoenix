The icons in the file tree can be customised. Even add icons for unsupported extensions!

![file-Icon.png](generatedDocs/images/file-Icon.png)

## How to add custom icons
In the Brackets preferences(`Debug Menu` > `Open preferences file`) file you'll need to add this to the bottom:


```json
"brackets-icons.icons": {}
```

Now you're ready to add some customizations. Here's an example icon preference:

```json
"brackets-icons.icons": {
	"html": {
			"icon": "fa fa-code",
			"color": "#E84D49",
			"size": 16
	}
}
```

You can use the classes in [Ionicons](http://ionicons.com), [Font Awesome](https://fortawesome.github.io/Font-Awesome/), or [Devicons](https://vorillaz.github.io/devicons/#/main) to specify the icon.

You can also add an extension that's not already supported the same way.

```json
	"html": {
			"icon": "fa fa-code",
			"color": "#E84D49",
			"size": 16
	},
	"spaghetti": {
			"icon": "fa fa-motorcycle",
			"color": "#DA70D6",
			"size": 13
	}
```

## credits
* Based on extension by https://github.com/ivogabe/Brackets-Icons
* Ionicons (MIT license), Font Awesome (GPL license) and Devicons (MIT license) are included in Brackets-Icons.
