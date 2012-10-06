# LazyWrite (deferred document.write implementation)

LazyWrite is build to have the best compromise between a good page load and write a complex external data in your page (like Advertising).
This allow you to control when should those data start to render or load.<br>
Size: less than 3.4KB (2KB gzipped) using UglifyJS.

# Advantages
* Increase highly the page load
* Stop freezing client navigator
* Forget iframe calls
* No other library required (like jQuery)
* No(or less) change of existing code

## Browser Support:
* IE      [tested on v6+]
* FireFox [tested on v2+]
* Chrome  [tested on v5+]
* Safari  [tested on v4+]
* Opera   [tested on v9.6+]

## API: ("LazyWrite" global variable)

### `.write()`
* original document.write function.

### `.prepare()`
* Replaces original `document.write()` with lazy write.
* This function will auto executes when "lazywrite.js" loaded.
* To prevent auto executing, sets `AUTO_LAZYWRITE = false;` before loads "lazywrite.js".

### `.render(content String [, holderId String] [, callback(errors Array) Function])`
* postpones content rendering in the given holder element or current place (like `document.write()`).
* An array of all caught exceptions will passes to the `callback()`.

### `.process()`
* Starts to render all contents.
* When all content be rendered, it will restores the original `document.write()`.

### `.findScripts([String type])`
* Finds and stacks all custom typed script elements.

## As [AMD Module](http://wiki.commonjs.org/wiki/Modules/AsynchronousDefinition)
* No global variable `LazyWrite`.
* no `.prepare()` auto executing.

## Example: Google AdSense
    <script src="lazywrite-min.js"></script>
    <script>
        google_ad_client = "ca-pub-5840687392233497";
        google_ad_slot = "9902234827";
        google_ad_width = 728;
        google_ad_height = 90;
        document.write('<script src="//pagead2.googlesyndication.com/pagead/show_ads.js"><\/script>');
        setTimeout(LazyWrite.process, 3000); // delay 3sec
    </script>
