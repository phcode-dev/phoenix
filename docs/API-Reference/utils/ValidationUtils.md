### Import :
```js
const ValidationUtils = brackets.getModule("utils/ValidationUtils")
```

<a name="isInteger"></a>

## isInteger(value) ⇒ <code>boolean</code>
Used to validate whether type of unknown value is an integer.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if value is a finite integer  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | Value for which to validate its type |

<a name="isIntegerInRange"></a>

## isIntegerInRange(value, [lowerLimit], [upperLimit]) ⇒ <code>boolean</code>
Used to validate whether type of unknown value is an integer, and, if so,
is it within the option lower and upper limits.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if value is an interger, and optionally in specified range.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | Value for which to validate its type |
| [lowerLimit] | <code>number</code> | Optional lower limit (inclusive) |
| [upperLimit] | <code>number</code> | Optional upper limit (inclusive) |

<a name="isWithinRange"></a>

## isWithinRange(value, [lowerLimit], [upperLimit]) ⇒ <code>boolean</code>
Used to validate whether type of unknown value is a number (including decimals),
and, if so, is it within the optional lower and upper limits.

**Kind**: global function  
**Returns**: <code>boolean</code> - true if value is a finite number, and optionally in specified range.  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>\*</code> | Value for which to validate its type |
| [lowerLimit] | <code>number</code> | Optional lower limit (inclusive) |
| [upperLimit] | <code>number</code> | Optional upper limit (inclusive) |

