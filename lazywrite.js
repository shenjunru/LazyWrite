/*!
 * LazyWrite - deferred document.write implementation
 * Version: 1.01 build 20110622
 * Website: http://github.com/xfsn/LazyWrite
 *
 * Copyright (c) 2011 Shen Junru
 * Released under the MIT License.
 */

(function(window, document, isIE, globalEval, undefined){

var
_index = 1,
_loadEvent  = isIE ? 'onreadystatechange' : 'onload',
_scriptFix  = /^\s*<!--/,
_lazyPrefix = 'lazy-holder-',
_lazyType   = 'text/lazyjs',

// original functions
_write   = document.write,
_writeln = document.writeln,
_origin  = _write.apply
    ? function(){ _write.apply(document, arguments); }
    : /* handle IE issue */ _write,

// render helper elements
_renderFragment = document.createDocumentFragment(),
_renderParser   = document.createElement('div'),
_scriptHolder   = undefined, // for multiple document.write in one inside script
_scriptBlocker  = undefined, // for external loading and stack executing
_previousHolder = undefined, // for same render holder checking
_parallelHolder = undefined, // for render in same render holder

// data storage
_writeStack  = [], // store the HTML that use document.write in the page
_scriptStack = [], // store the script and it's holder
_currntWrite = undefined, // current write item

// flags
_started   = false,
_continued = true,

// combine an array
_combine = [].join,

// error catcher
_error = function(ex){
    _currntWrite.ex.push(ex);
},

// event handler of window.onerror
_errorCatch = function(message, url){
    if (_scriptBlocker && (url === _scriptBlocker.src) && !_scriptBlocker._error) {
        _error(message);
        return true;
    }
},

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

// event handler of script.onload
_onScriptLoad = function(scriptHolder, script){
    clearTimeout(script._tid);
    script.done = true;

    // handle memory leak in IE
    // can't set as undefined
    script[_loadEvent] = script.onerror = null;
    // remove script holder, if it still in the document
    _removeElement(scriptHolder);

    if (_scriptBlocker === script) {
        // release the script blocker
        _scriptBlocker = undefined;
        // continue the stack executing
        _continue();
    }
},

// load script element
_loadScript = function(scriptHolder, script){
    if (script.src) {
        // handle onload event
        script[_loadEvent] = function(){
            var state = isIE && script.readyState;
            if (!script.done && (!state || /complete|loaded/.test(state))) {
                // handle IE readyState issue, simulate the 'complete' readyState
                // waiting the load script be executed.
                if (state === 'loaded' && !script.loaded) {
                    script.loaded = true;
                    setTimeout(arguments.callee);
                } else _onScriptLoad(scriptHolder, script);
            }
        };

        // handle load exception
        // for Chrome, IE9, FireFox: NON-EXISTS, TIMEOUT
        // for Safari: NON-EXISTS
        script.onerror = function(event){
            script._error = event;
            // log exception
            _error(event);
            // trig onload handler
            _onScriptLoad(scriptHolder, script);
        };

        // set the script blocker
        _scriptBlocker = script;

        // postpone load the script file
        setTimeout(function(){
            _appendElement(scriptHolder, script);
        });

        // load timeout
        // for IE<8, Opera: catch NON-EXISTS, TIMEOUT, RUNTIME-EXCEPTION
        script._tid = setTimeout(function(){
            _error('unknow');
            _onScriptLoad(scriptHolder, script);
        }, 60500);
    } else {
        // handle FF 3.6 script non-immediate-execute issue
        // use eval instead insert script element to document
        try {
            // handle IE eval() SyntaxError.
            globalEval(script.text.replace(_scriptFix, ''));
        } catch (ex) {
            _error(ex);
        }

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
        scripts = _renderParser.getElementsByTagName('script'),
        oldStack, newStack;

    // replace script elements by script holders
    while (scripts[0]) {
        stack.push({
            script: scripts[0],
            holder: _replaceElement(scripts[0], element = _createHolder())
        });
    }

    // convert to DocumentFragment
    while (_renderParser.firstChild) {
        _renderFragment.appendChild(_renderParser.firstChild);
    }

    // render in the document
    if (_previousHolder === renderHolder) {
        // append the stack after last script stack in the global script stack.
        _scriptStack = (
            // remove executed stack item frist
            newStack = _scriptStack.n.slice(_scriptStack.l - _scriptStack.length).concat(stack)
        ).concat(oldStack = _scriptStack.o);
        _scriptStack.n = newStack;
        _scriptStack.o = oldStack;
        
        // insert before the parallel holder
        _parallelHolder.parentNode.insertBefore(_renderFragment, _parallelHolder);
    } else {
        // put the stack at the top of the global script stack.
        _scriptStack = stack.concat(oldStack = _scriptStack);
        _scriptStack.n = stack;
        _scriptStack.o = oldStack;
    
        // append the parallel holder
        _parallelHolder = _renderFragment.appendChild(_parallelHolder || _createHolder());

        // replace holder in the document
        inside
            // handle IE6 subsequent replaceChild() issue in Windows XP
            ? renderHolder.parentNode.insertBefore(_renderFragment, renderHolder.nextSibling)
            :_replaceElement(renderHolder, _renderFragment);
    }

    _scriptStack.l = _scriptStack.length;

    // store current render holder as previous holder
    _previousHolder = renderHolder;

    // execute scripts and return continue flag
    if (_continued && stack.length) _continued = _executeScripts();

    // return continue flag
    return _continued;
},

// render one item of the global write stack
// return continue flag
_renderWrite = function(item){
    return item && item.html && _renderHTML(document.getElementById(item.id), item.html);
},

// render the global write stack
_renderStack = function(){
    while(_renderWrite(_currntWrite = _writeStack.shift()));
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
    if (_executeScripts()) {
        try {
            // execute callback function
            _currntWrite.cb && _currntWrite.cb(_currntWrite.ex);
        } catch (ex) {
            _error(ex);
        }

        _renderStack();
    }
},

// add content to write stack
_addContent = function(content, holder, callback){
    if (typeof callback !== 'function') callback = undefined;
    if (typeof holder   === 'function') callback = holder, holder = undefined;

    // write a place holder in the document
    holder || _origin('<span id="' + (holder = _lazyPrefix + _index++) + '"></span>');

    // add to write stack
    _writeStack.push({ id: holder, html: content, cb: callback, ex: [] });
},

// lazy write function
_lazyEngine = function(){
    var html = _combine.call(arguments, '');
    if (html) if (_started) try {
        // render HTML directly
        _renderHTML(_scriptHolder, html, true);
    } catch (ex) {
        _error(ex);
    } else _addContent(html);
};

(window.LazyWrite = {
    /**
     * original document.write function
     * @param {String} content content to write into document
     */ 
    write: _origin,

    /**
     * add content to later render,
     * callback function has one parameter: {Array} exceptions - catched exceptions
     * @param {String} content content to later render
     * @param {String|Function} holder [optional] place holder id or callback function
     * @param {Function} callback [optional] callback function
     */ 
    render: _addContent,

    /**
     * replace original document.write functions by lazy engine
     */ 
    prepare: function(){
        document.writeln = document.write = _lazyEngine;
    },

    /**
     * start to process the contents
     */
    process: function(){
        if (_started) return;
        _started = true;
        _renderStack();
    },

    /**
     * process all custom typed script elements
     * @param {String} type custom script type, default is 'text/lazyjs'
     */
    findScripts: function(type){
        type = type || _lazyType;

        var _scripts = document.getElementsByTagName('script'),
            holder, require, len, i = 0, scripts = [];

        if (_scripts) {
            for (len = _scripts.length; i < len; i++) scripts[i] = _scripts[i];
            for (i = 0; i < len; i++) if (type === scripts[i].type) {
                _replaceElement(scripts[i], holder = _createHolder());
                if (require = scripts[i].getAttribute('require')) {
                    _appendElement(_renderParser, document.createElement('script')).src = require;
                }
                _appendElement(_renderParser, scripts[i]);
                _addContent(_renderParser.innerHTML, holder.id = _lazyPrefix + _index++);
                _renderParser.innerHTML = '';
            }
        }
    }
}).prepare();

// handle srcipt load exception
// for Chrome, IE, FireFox: RUNTIME-EXCEPTION
// this does not work, if IE has script debugging turned on. the default is off.
// see: http://msdn.microsoft.com/en-us/library/ms976144#weberrors2_topic3
window.onerror = _errorCatch;
//window.addEventListener
//    ? window.addEventListener('error', _errorCatch, false)
//    : window.attachEvent('onerror', _errorCatch);

})(window, document, /*@cc_on!@*/!1, function(){
    eval.apply(window, arguments);
});
