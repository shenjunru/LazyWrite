/*!
 * LazyWrite - deferred document.write implementation
 * Version: 1.0 beta build 20110212
 * Website: http://github.com/xfsn/LazyWrite
 * 
 * Copyright (c) 2011 Shen Junru
 * Released under the MIT License.
 */

(function(document, undefined){

var
_index = 1,
_isIE = !-[1,],
_loadEvent = _isIE ? 'onreadystatechange' : 'onload',
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
    console.log('==REPLACE ELEMENT=================================');
    console.log('original: ' + (element.id || element.nodeName));
    console.log('original content: ' + element.innerHTML);
    console.log('replace: ' + (other.id || other.nodeName));
    console.log('replace content: ' + (other.innerHTML || other.src || other.text || ('[' + other.childNodes.length + ']')));
    return element.parentNode.replaceChild(other, element) && other;
},

// return a new holder element
_createHolder = function(prefix){
    var holder = document.createElement('span');
    holder.id = prefix + _index++;
    console.log('create holder: <' + holder.id + '>');
    return holder;
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
            console.log('==SCRIPT EVENT====================================');
            console.log('blocker: '    + (_scriptBlocker ? _scriptBlocker.src : 'none'));
            console.log('load url: '   + script.src);
            console.log('load state: ' + (script.readyState || '->onload'));
            console.log('load flag: '  + script.loaded);
            console.log('continue: '   + _continued);
            var state = _isIE && script.readyState;
            if (!script.done && (!state || /complete|loaded/.test(state))) {
                // handle IE readyState issue, simulate the 'complete' readyState
                // waiting the load script be executed.
                if (state === 'loaded' && !script.loaded) {
                    script.loaded = true;
                    setTimeout(arguments.callee);
                } else {
                    script.done = true;
                    console.log('script executed');
                    
                    // handle memory leak in IE
                    // can't set as undefined
                    script[_loadEvent] = null;
                    // remove script holder, if it still in the document
                    _removeElement(scriptHolder);
                    
                    if (_scriptBlocker === script) {
                        // release the script blocker
                        _scriptBlocker = undefined;
                        console.log('unblock: ' + script.src);
                        // continue the stack executing
                        _continue();
                    }
                }
            }
        };
        
        // set the script blocker
        _scriptBlocker = script;
        console.log('block: ' + script.src);
        
        // postpone load the script file
        setTimeout(function(){
            _appendElement(scriptHolder, script);
        });
    } else {
        // handle interrupted by script error
        script.text = 'try{' + script.text + '}catch(_ex_){}';
        
        // immediate execute the script
        _appendElement(scriptHolder, script);

        // remove script holder, if it still in the document
        _removeElement(scriptHolder);
    }
},

// execute one item of scripts stack
// return continue flag
_executeScript = function(renderHolder, item){
    if (item) {
        console.log('==EXECUTE SCRIPT==================================');
        console.log('render holder: ' + (renderHolder ? renderHolder.id : 'none'));
        console.log('script holder: ' + (item ? item.holder.id : 'none'));
        console.log('blocker: '    + (_scriptBlocker ? _scriptBlocker.src : 'none'));
        console.log('content: ' + (item ? item.script.src || item.script.text : 'none'));
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
_executeScripts = function(renderHolder, flag/* this isn't a parameter */){
    while ((flag = _executeScript(renderHolder, _scriptStack.shift())));
    return flag !== false && !_scriptBlocker;
},

// render one document.write stuff
// return continue flag
_renderHTML = function(renderHolder, html, inside){
    console.log('==RENDER HTML====================================');
    console.log('render holder: ' + renderHolder.id);
    console.log('previous holder: ' + (_previousHolder ? _previousHolder.id : 'none'));
    console.log('render holder parent: ' + (renderHolder.parentNode ? renderHolder.parentNode.id : 'none'));
    console.log('previous holder parent: ' + (_previousHolder && _previousHolder.parentNode ? _previousHolder.parentNode.id : 'none'));
    console.log('html: ' + html);
    
    // convert HTML
    if (_isIE) {
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
            holder: _replaceElement(scripts[0], element = _createHolder('script_holder_'))
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
        _parallelHolder = _renderFragment.appendChild(_parallelHolder || _createHolder('parallel_holder_'));
        
        // replace holder in the document
        inside
            // handle IE6 subsequent replaceChild() issue in Windows XP
            ? renderHolder.parentNode.insertBefore(_renderFragment, renderHolder.nextSibling)
            :_replaceElement(renderHolder, _renderFragment);
    }
    
    // store current render holder as previous holder
    _previousHolder = renderHolder;
    
    // execute scripts and return continue flag
    if (stack.length) _continued = _executeScripts(renderHolder);
    _continued ? console.log('<< RENDER CONTINUING <<<<<<<<<<<<<<<<<<<<<<<<<<<<<')
               : console.log('<< RENDER STOPING <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
	       
    // return continue flag
    return _continued;
},

// render one item of the global write stack
// return continue flag
_renderWrite = function(item){
    console.log('##################################################');
    return item && _renderHTML(document.getElementById(item.id), item.html);
},

// render the global write stack
_renderStack = function(flag){
    while(_renderWrite(_writeStack.shift()));
    console.log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    if (_continued && !_writeStack.length) {
        console.log('>> END OF LAZY WRITE <<');
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
//        document.write = _write;
//        document.writeln = _writeln;
        document.write = document.writeln = function(){
            alert(_combine.call(arguments, ''));
        };
    }
},

// continue the rest stack (script and write)
_continue = function(){
    console.log('>> continue() <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
    _continued = true;
    if (_executeScripts()) _renderStack();
};

// replace original functions
document.writeln = document.write = function(){
    var holder, html = _combine.call(arguments, '');
    console.log('==DOCUMENT.WRITE==================================');
    console.log('started: ' + _started);
    console.log('script holder: ' + (_scriptHolder ? _scriptHolder.id : 'none'));
    console.log('html: ' + html);
    if (_started) {
        // render HTML directly
        try {
            _renderHTML(_scriptHolder, html, true);
        } catch (e) {
            console.log(e);
        }
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
    write: function(){
        _write.apply(document, arguments);
    },
    // start to process the whole stack
    start: function(){
        if (_started) return;
        console.log('>> START OF LAZY WRITE <<');
        _started = true;
        _renderStack();
    }
};

})(document);

if (!window.console) console = {};
if (!console.log) console.log = window.opera ? opera.postError : function(){};
console.clear && console.clear();