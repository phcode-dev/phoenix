### Import :
```js
const LocalizationUtils = brackets.getModule("utils/LocalizationUtils")
```

<a name="getLocalizedLabel"></a>

## getLocalizedLabel(locale) ⇒ <code>string</code>
Converts a language code to its written name, if possible.
If not possible, the language code is simply returned.

**Kind**: global function  
**Returns**: <code>string</code> - The language's name or the given language code  

| Param | Type | Description |
| --- | --- | --- |
| locale | <code>string</code> | The two-char language code |

<a name="getFormattedDateTime"></a>

## getFormattedDateTime([date], [lang], [dateTimeFormat]) ⇒ <code>string</code>
Formats a given date object into a locale-aware date and time string.

**Kind**: global function  
**Returns**: <code>string</code> - - The formatted date and time string (e.g., "Dec 24, 2024, 10:30 AM").  

| Param | Type | Description |
| --- | --- | --- |
| [date] | <code>Date</code> | The date object to format. If not provided, the current date and time will be used. |
| [lang] | <code>string</code> | Optional language code to use for formatting (e.g., 'en', 'fr').                          If not provided, defaults to the application locale or 'en'. |
| [dateTimeFormat] | <code>Object</code> | Optional object specifying the date and time formatting options.                                    Defaults to { dateStyle: 'medium', timeStyle: 'short' }. |
| [dateTimeFormat.dateStyle] | <code>string</code> | Specifies the date format style. One of: DATE_TIME_STYLE.* |
| [dateTimeFormat.timeStyle] | <code>string</code> | Specifies the time format style. One of: DATE_TIME_STYLE.* |

<a name="dateTimeFromNow"></a>

## dateTimeFromNow([date], [lang]) ⇒ <code>string</code>
Returns a relative time string (e.g., "2 days ago", "in 3 hours") based on the difference between the given date and now.

**Kind**: global function  
**Returns**: <code>string</code> - - A human-readable relative time string (e.g., "2 days ago", "in 3 hours").  

| Param | Type | Description |
| --- | --- | --- |
| [date] | <code>Date</code> | The date to compare with the current date and time. If not given, defaults to now. |
| [lang] | <code>string</code> | Optional language code to use for formatting (e.g., 'en', 'fr').                          If not provided, defaults to the application locale or 'en'. |

