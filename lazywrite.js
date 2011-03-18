/*!
 * LazyWrite - deferred document.write implementation
 * Version: 1.0 beta build 20110316
 * Website: http://github.com/xfsn/LazyWrite
 * 
 * Copyright (c) 2011 Shen Junru
 * Released under the MIT License.
 */

(function(document, isIE, globalEval, undefined){

var
_index = 1,
_loadEvent = isIE ? 'onreadystatechange' : 'onload',
_scriptFix = /^\s*<!--/,
// original functions
_write   = document.write,
_writeln = document.writeln,
// render helper elements
_renderFragment = document.createDocumentFragment(),
_renderParser   = document.createElement('div'),
_scriptHolder   = undefined, // for multiple document.write in one inside script.
_scriptBlocker  = undefined, // for external loading and stack executing.
_previousHolder = undefined, // for same render holder checking.
_parallelHolder = undefined, // for render in same render holder.
// data storage
_writeStack  = [], // store the HTML that use document.write in the page
_scriptStack = [], // store the script and it's holder
// flags
_started   = false,
_continued = true,

// combine an array
_combine = [].join,

// append the element to holder element
// return the appended element
_appendElement = function(holder, element){
    return holder.appendChild(element);
},

// remove the element from the document, if it in the document
// return the removed element
_removeElement = function(element){
    return element.parentNode ? element.parentNode.removeChild(element) : element;
},

// replace the element by the new element
// return the replace element
_replaceElement = function(element, other){
    return element.parentNode.replaceChild(other, element) && other;
},

// return a new holder element
_createHolder = function(){
    return document.createElement('span');
},

// clone a script element for cross browser issue
// return the new script element
_cloneScript = function cloneScript(script){
    var result = document.createElement('script');
    result.type = script.type;
    if (script.src) result.src  = script.src;
    else result.text = script.text;
    return result;
},

// load script element
_loadScript = function(scriptHolder, script){
    if (script.src) {
        script[_loadEvent] = function(){
            var state = isIE && script.readyState;
            if (!script.done && (!state || /complete|loaded/.test(state))) {
                // handle IE readyState issue, simulate the 'complete' readyState
                // waiting the load script be executed.
                if (state === 'loaded' && !script.loaded) {
                    script.loaded = true;
                    setTimeout(arguments.callee);
                } else {
                    script.done = true;
                    
                    // handle memory leak in IE
                    // can't set as undefined
                    script[_loadEvent] = null;
                    // remove script holder, if it still in the document
                    _removeElement(scriptHolder);
                    
                    if (_scriptBlocker === script) {
                        // release the script blocker
                        _scriptBlocker = undefined;
                        // continue the stack executing
                        _continue();
                    }
                }
            }
        };
        
        // set the script blocker
        _scriptBlocker = script;
        
        // postpone load the script file
        setTimeout(function(){
            _appendElement(scriptHolder, script);
        });
    } else {
        // handle FF 3.6 script non-immediate-execute issue
        // use eval instead insert script element to document
        try {
            // handle IE eval() SyntaxError.
            globalEval(script.text.replace(_scriptFix, ''));
        } catch (ex) {}
        
        // remove script holder, if it still in the document
        _removeElement(scriptHolder);
    }
},

// execute one item of scripts stack
// return continue flag
_executeScript = function(item){
    if (item) {
        // set the script holder as the render holder for inside 'document.write'.
        if (!_scriptBlocker) _scriptHolder = item.holder;
        
        // load / execute script
        _loadScript(item.holder, item.script = _cloneScript(item.script));
        
        // return continue flag
        return !item.script.src;
    }
},

// execute the global scripts stack
// return continue flag
_executeScripts = function(flag/* this isn't a parameter */){
    while ((flag = _executeScript(_scriptStack.shift())));
    return flag !== false && !_scriptBlocker;
},

// render one document.write stuff
// return continue flag
_renderHTML = function(renderHolder, html, inside){
    // convert HTML
    if (isIE) {
        // handle IE innerHTML issue
        _renderParser.innerHTML = '<img />' + html;
        _removeElement(_renderParser.firstChild);
    } else {
        _renderParser.innerHTML = html;
    }
    
    var stack = [], // store the the scripts and their holders over this rendering.
        scripts = _renderParser.getElementsByTagName('script');

    // replace script elements by script holders
    while (scripts[0]) {
        stack.push({
            script: scripts[0],
            holder: _replaceElement(scripts[0], element = _createHolder())
        });
    }
    // put the stack at the top of the global script stack.
    _scriptStack = stack.concat(_scriptStack);
    
    // convert to DocumentFragment
    while (_renderParser.firstChild) {
        _renderFragment.appendChild(_renderParser.firstChild);
    }
    
    // render in the document
    if (_previousHolder === renderHolder) {
        // insert before the parallel holder
        _parallelHolder.parentNode.insertBefore(_renderFragment, _parallelHolder);
    } else {
        // append the parallel holder
        _parallelHolder = _renderFragment.appendChild(_parallelHolder || _createHolder());
        
        // replace holder in the document
        inside
            // handle IE6 subsequent replaceChild() issue in Windows XP
            ? renderHolder.parentNode.insertBefore(_renderFragment, renderHolder.nextSibling)
            :_replaceElement(renderHolder, _renderFragment);
    }
    
    // store current render holder as previous holder
    _previousHolder = renderHolder;
    
    // execute scripts and return continue flag
    if (stack.length) _continued = _executeScripts();
    
    // return continue flag
    return _continued;
},

// render one item of the global write stack
// return continue flag
_renderWrite = function(item){
    return item && item.html && _renderHTML(document.getElementById(item.id), item.html);
},

// render the global write stack
_renderStack = function(flag){
    while(_renderWrite(_writeStack.shift()));
    if (_continued && !_writeStack.length) {
        // remove parallel holder, if it exists
        _parallelHolder && _removeElement(_parallelHolder);
        
        // destroy objects
        _renderFragment
            = _renderParser
            = _scriptHolder
            = _scriptBlocker
            = _previousHolder
            = _parallelHolder
            = undefined;
        
        // restore original functions
        document.write = _write;
        document.writeln = _writeln;
    }
},

// continue the rest stack (script and write)
_continue = function(){
    _continued = true;
    if (_executeScripts()) _renderStack();
};

// replace original functions
document.writeln = document.write = function(){
    var holder, html = _combine.call(arguments, '');
    if (html) if (_started) {
        // render HTML directly
        try {
            _renderHTML(_scriptHolder, html, true);
        } catch (ex) {}
    } else {
        // add to write stack
        _writeStack.push({ id: holder = 'document_write_' + _index++, html: html });
        
        // write a place holder in the document
        holder = '<span id="' + holder + '"></span>';
        _write.call ? _write.call(document, holder) : _write(holder) /* handle IE issue */;
    }
};

window.LazyWrite = {
    // original document.write function
    write: _write.apply ? function(){
        _write.apply(document, arguments);
    } : _write /* handle IE issue */,
    
    // add custom holder and content to write stack
    render: function(holder, content){
        holder && content && _writeStack.push({
            id: holder,
            html: content
        });
    },
    
    // start to process the whole stack
    start: function(){
        if (_started) return;
        _started = true;
        _renderStack();
    }
};

})(document, /*@cc_on!@*/!1, function(){
    eval.apply(window, arguments);
});
