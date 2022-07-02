Now you can customize your icons and even add unsupported extensions! In the Brackets preferences file you'll need to add this to the bottom:

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

Ionicons (MIT license), Font Awesome (GPL license) and Devicons (MIT license) are included in Brackets-Icons.
