/*!
 * LazyWrite 1.2.2 (sha1: 0D13ACD1F14A59FAE9DC446FC3F41D55D403C07A)
 * (c) 2011~2015 Shen Junru. MIT License.
 * http://github.com/shenjunru/LazyWrite
 */

(function(factory, globalEval, window, document, isIE){
    if ('function' === typeof define && define.amd) {
        // AMD. Register as an anonymous module.
        define(function(){
            return factory(globalEval, window, document, isIE, false);
        });
    } else {
        // Browser globals
        window.LazyWrite = factory(globalEval, window, document, isIE, false !== window.AUTO_LAZYWRITE);
    }
}(function(globalEval, window, document, isIE, autoHook, undef){

    var expose,
        seed = 1,
        lazyType    = 'text/lazyjs',
        lazyPrefix  = 'lazy-holder-',
        scriptEvent = isIE ? 'onreadystatechange' : 'onload',
        readyStates = { complete:1, loaded: 1 },

        // handle IE eval() SyntaxError.
        rFixEval = /^\s*<!--/,

        // check html partial writing, like:
        //  document.write('<script>');
        //  document.write('alert("ok")');
        //  document.write('<\/script>');
        rHtmlTag = /<([a-z]+)(?:\s+[a-z]+(?:=(?:'[^']*'|"[^"]*"|[^'">\s]*))?)*\s*(>?)/i,
        rNoEnd   = /area|base|br|col|frame|hr|img|input|link|meta|param/i,
        sPartial = '',
        sOpenTag = '',
        sHalfTag = '',

        // render helper elements
        renderFragment = document.createDocumentFragment(),
        renderParser   = createElement('div'),
        scriptBlocker  = undef, // for external loading and stack executing
        scriptHolder   = undef, // for multiple document.write in one inside script
        previousHolder = undef, // for same render holder checking
        parallelHolder = undef, // for render in same render holder

        // data storage
        writeStack   = [], // store the HTML that use document.write in the page
        scriptStack  = [], // store the script and it's holder
        currentWrite = undef, // current write item

        // flags
        started   = false,
        continued = true,

        // array join function
        combine = [].join,

        // original functions
        originalWrite   = document.write,
        originalWriteln = document.writeln,
        originalOnError = window.onerror,
        documentWrite = originalWrite.apply
            ? function(){ originalWrite.apply(document, arguments); }
            : /* handle IE issue */ originalWrite;


    function log(message){
        console.log(message);
    }

    // error catcher
    function logError(ex){
        log('Exception: ' + ex);
        currentWrite.errors.push(ex);
    }

    // append the element to holder element
    // return the appended element
    function appendElement(holder, element){
        return holder.appendChild(element);
    }

    // remove the element from the document, if it in the document
    // return the removed element
    function removeElement(element){
        return element.parentNode ? element.parentNode.removeChild(element) : element;
    }

    // replace the element by the new element
    // return the replace element
    function replaceElement(element, other){
        log('==REPLACE ELEMENT=================================');
        log('original: ' + (element.id || element.nodeName));
        log('original content: ' + element.innerHTML);
        log('replace: ' + (other.id || other.nodeName));
        log('replace content: ' + (other.innerHTML || other.src || other.text || ('[' + other.childNodes.length + ']')));
        return element.parentNode.replaceChild(other, element) && other;
    }

    function createElement(tagName){
        return document.createElement(tagName);
    }

    // return a new holder element
    function createHolder(prefix){
        var holder = createElement('span');
        holder.id = prefix + seed++;
        log('create holder: <' + holder.id + '>');
        return holder;
    }

    // clone a script element for cross browser issue
    // return the new script element
    function cloneScript(script){
        var result = createElement('script');
        result.type = script.type;
        if (script.src) {
            result.src  = script.src;
        } else {
            result.text = script.text;
        }
        return result;
    }

    // event handler of script.onload
    function scriptComplete(scriptHolder, script, memo){
        clearTimeout(memo.timeout);
        memo.done = true;
        log('script executed');

        // prevent memory leak in IE
        script.onerror = script[scriptEvent] = '';

        // remove script holder, if it still in the document
        removeElement(scriptHolder);

        if (memo === scriptBlocker) {
            // release the script blocker
            scriptBlocker = undef;
            log('unblock: ' + memo.src);

            // continue the stack executing
            executeStacks();
        }
    }

    // load script element
    function loadScript(scriptHolder, script){
        if (script.src) {
            var memo = { src: script.src };

            // handle onload event
            script[scriptEvent] = function(){
                log('==SCRIPT EVENT====================================');
                log('blocker: '    + (scriptBlocker ? scriptBlocker.src : 'none'));
                log('load url: '   + script.src);
                log('load state: ' + (script.readyState || '->onload'));
                log('load flag: '  + memo.loaded);
                log('continue: '   + continued);

                var state = isIE && script.readyState;
                if (!memo.done && (!state || readyStates[state])) {
                    if (state === 'loaded' && !memo.loaded) {
                        // handle IE readyState issue
                        // simulate the 'complete' readyState
                        memo.loaded = true;
                        setTimeout(script[scriptEvent]);
                    } else {
                        scriptComplete(scriptHolder, script, memo);
                    }
                }
            };

            // handle load exception
            // Chrome, FireFox, IE9+: NON-EXISTS, TIMEOUT
            // Safari: NON-EXISTS
            script.onerror = function(event){
                log('==SCRIPT.ONERROR CATCHED EXCEPTION===============');
                // log exception
                logError(memo.error = event);
                // trig onload handler
                scriptComplete(scriptHolder, script, memo);
            };

            // postpone load the script file
            setTimeout(function(){
                appendElement(scriptHolder, script);
            });

            // load timeout
            // IE<8, Opera: NON-EXISTS, TIMEOUT, RUNTIME-EXCEPTION
            memo.timeout = setTimeout(function(){
                logError('unknow');
                scriptComplete(scriptHolder, script, memo);
            }, 60500);

            // set the script blocker
            scriptBlocker = memo;
            log('block: ' + script.src);
        } else {
            // handle FF 3.6 script non-immediate-execute issue
            // use eval instead insert script element to document
            try {
                globalEval(script.text.replace(rFixEval, ''));
            } catch (ex) {
                logError(ex);
            }

            // remove script holder, if it still in the document
            removeElement(scriptHolder);
        }
    }

    // execute one item of scripts stack
    // return continue flag
    function executeScript(item, renderHolder){
        if (item) {
            log('==EXECUTE SCRIPT==================================');
            log('render holder: ' + (renderHolder ? renderHolder.id : 'none'));
            log('script holder: ' + (item ? item.holder.id : 'none'));
            log('blocker: '    + (scriptBlocker ? scriptBlocker.src : 'none'));
            log('content: ' + (item ? item.script.src || item.script.text : 'none'));
            // set the script holder as the render holder for inside 'document.write'.
            if (!scriptBlocker) {
                scriptHolder = item.holder;
            }

            // load / execute script
            loadScript(item.holder, item.script = cloneScript(item.script));

            // return continue flag
            return !item.script.src;
        }
    }

    // execute the global scripts stack
    // return continue flag
    function executeScripts(renderHolder){
        for (var flag; flag = executeScript(scriptStack.shift(), renderHolder););
        return flag !== false && !scriptBlocker;
    }

    // render one document.write stuff
    // return continue flag
    function renderHTML(renderHolder, html, inside){
        log('==RENDER HTML====================================');
        log('render holder: ' + renderHolder.id);
        log('previous holder: ' + (previousHolder ? previousHolder.id : 'none'));
        log('render holder parent: ' + (renderHolder.parentNode ? renderHolder.parentNode.id : 'none'));
        log('previous holder parent: ' + (previousHolder && previousHolder.parentNode ? previousHolder.parentNode.id : 'none'));
        log('html: ' + html);

        // convert HTML
        if (isIE) {
            // handle IE innerHTML issue
            renderParser.innerHTML = '<img />' + html;
            removeElement(renderParser.firstChild);
        } else {
            renderParser.innerHTML = html;
        }

        var stack = [], // store the the scripts and their holders over this rendering.
            scripts = renderParser.getElementsByTagName('script'),
            oldStack, newStack;

        // replace script elements by script holders
        while (scripts[0]) {
            stack.push({
                script: scripts[0],
                holder: replaceElement(scripts[0], createHolder('script_holder_'))
            });
        }

        // convert to DocumentFragment
        while (renderParser.firstChild) {
            renderFragment.appendChild(renderParser.firstChild);
        }

        // render in the document
        if (previousHolder === renderHolder) {
            // append the stack after last script stack in the global script stack.
            scriptStack = (
                // remove executed stack item first
            newStack = scriptStack.n.slice(scriptStack.l - scriptStack.length).concat(stack)
            ).concat(oldStack = scriptStack.o);
            scriptStack.n = newStack;
            scriptStack.o = oldStack;

            // insert before the parallel holder
            parallelHolder.parentNode.insertBefore(renderFragment, parallelHolder);
        } else {
            // put the stack at the top of the global script stack.
            scriptStack = stack.concat(oldStack = scriptStack);
            scriptStack.n = stack;
            scriptStack.o = oldStack;

            // append the parallel holder
            parallelHolder = renderFragment.appendChild(parallelHolder || createHolder('parallel_holder_'));

            // replace holder in the document
            if (inside) {
                // handle IE6 subsequent replaceChild() issue in Windows XP
                renderHolder.parentNode.insertBefore(renderFragment, renderHolder.nextSibling);
            } else {
                replaceElement(renderHolder, renderFragment);
            }
        }

        scriptStack.l = scriptStack.length;

        // store current render holder as previous holder
        previousHolder = renderHolder;

        // execute scripts and return continue flag
        if (continued && stack.length) {
            continued = executeScripts();
        }

        if (continued) {
            log('<< RENDER CONTINUING <<<<<<<<<<<<<<<<<<<<<<<<<<<<<')
        } else {
            log('<< RENDER STOPING <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
        }

        // return continue flag
        return continued;
    }

    // render one item of the global write stack
    // return continue flag
    function renderWrite(item){
        log('##################################################');
        return item && item.html && renderHTML(document.getElementById(item.id), item.html);
    }

    // render the global write stack
    function renderStack(){
        while (renderWrite(currentWrite = writeStack.shift()));
        log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
        if (continued && !writeStack.length) {
            log('>> END OF LAZY WRITE <<');
            // remove parallel holder, if it exists
            if (parallelHolder) {
                removeElement(parallelHolder);
            }

            // destroy objects
            scriptBlocker
                = scriptHolder
                = previousHolder
                = parallelHolder
                = undef;

            // restore original functions
//            document.write = originalWrite;
//            document.writeln = originalWriteln;
            document.write = document.writeln = function(){
                alert(combine.call(arguments, ''));
            };

            // restore flag
            started = false;
        }
    }

    // continue the rest stack (script and write)
    function executeStacks(){
        log('>> continue() <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
        continued = true;
        if (executeScripts()) {
            try {
                // execute callback function
                if (currentWrite.callback) {
                    currentWrite.callback(currentWrite.errors);
                }
            } catch (ex) {
                logError(ex);
            }

            renderStack();
        }
    }

    /**
     * add content to write stack
     *
     * @param {String} content - content to later render
     * @param {String} [holderId] - place holder id
     * @param {Function} [callback] - function(errors Array)
     */
    function addContent(content, holderId, callback){
        if ('function' !== typeof callback) {
            callback = undef;
        }
        if ('function' === typeof holderId) {
            callback = holderId;
            holderId = undef;
        }

        // write a place holder in the document
        if (!holderId) {
            documentWrite('<span id="' + (holderId = lazyPrefix + seed++) + '"></span>');
        }

        // add to write stack
        writeStack.push({ id: holderId, html: content, callback: callback, errors: [] });
    }

    // check html end with a opened tag
    function tagOpened(html){
        var index, name, match, _html = sHalfTag + html;

        // reset
        sHalfTag = '';
        if (tagClosed(_html)) {
            sOpenTag = '';
        }

        while (( match = rHtmlTag.exec(_html) )) {
            _html = _html.slice(match.index + match[0].length);
            name = match[1];

            // handle: half open tag
            if (!match[2]) {
                if (!/\S/.test(_html)) {
                    sHalfTag = match[0];
                    return (sOpenTag = sOpenTag || name);
                }
                if (/=$/.test(match[0]) && /^['"]/.test(_html)) {
                    sHalfTag = match[0] + _html;
                    return (sOpenTag = sOpenTag || name);
                }

            // handle: no end tag
            } else if (rNoEnd.test(name)) {
                // do nothing

            // handle: matched end tag
            } else if (-1 !== (index = _html.indexOf('</' + name + '>'))) {
                _html = _html.slice(index + name.length + 3);

            // handle: no matched end tag
            } else {
                return (sOpenTag = sOpenTag || name);
            }
        }
    }

    // check html is closed
    function tagClosed(html){
        return !sOpenTag || (-1 !== html.indexOf('</' + sOpenTag + '>'));
    }

    // lazy write
    function lazyWrite(){
        var html = combine.call(arguments, '');
        log('==DOCUMENT.WRITE==================================');
        log('started: ' + started);
        log('script holder: ' + (scriptHolder ? scriptHolder.id : 'none'));
        log('html: ' + html);

        if (html) {
            if (tagOpened(html)) {
                // html tag is not closed
                // wait close html tag
                sPartial += html;

            } else if (tagClosed(html)) {
                // html tag is closed

                // get intact html
                html = sPartial + html;

                // clear status
                sOpenTag = sPartial = sHalfTag = '';

                if (started) {
                    try {
                        // render HTML directly
                        renderHTML(scriptHolder, html, true);
                    } catch (ex) {
                        logError(ex);
                    }
                } else {
                    addContent(html);
                }

            } else {
                sPartial += html;
            }
        }
    }

    // replace original document.write functions by lazy write
    function hookWrite(){
        document.writeln = document.write = lazyWrite;
    }

    // handle srcipt load exception
    // Chrome, IE, FireFox: RUNTIME-EXCEPTION
    // this does not work, if IE has script debugging turned on. the default is off.
    // see: http://msdn.microsoft.com/en-us/library/ms976144#weberrors2_topic3
    // can't use addEventListener or attachEvent
    window.onerror = function(message, url){
        log('==WINDOW.ONERROR CATCHED EXCEPTION===============');
        log('message: ' + message);
        log('url: ' + url);
        if (scriptBlocker && (url === scriptBlocker.src) && !scriptBlocker.error) {
            logError(message);
        }
        if (originalOnError) {
            originalOnError.apply(window, arguments);
        }
    };

    if (autoHook) {
        hookWrite();
    }

    return expose = {
        /** original document.write function */
        write: documentWrite,

        /** replace original function */
        prepare: hookWrite,

        /**
         * add content to later render
         *
         * @param {String} content - content to later render
         * @param {String} [holder] - place holder id
         * @param {Function} [callback] - function(errors Array)
         */
        render: addContent,

        /** start to process the contents */
        process: function(){
            if (started) {
                return;
            }
            started = true;
            expose.prepare();
            renderStack();
        },

        /**
         * process all custom typed script elements
         *
         * @param {String} [type='text/lazyjs'] - custom script type
         */
        findScripts: function(type){
            type = type || lazyType;

            var scripts = document.getElementsByTagName('script'),
                index   = scripts.length - 1,
                matches = [],
                script, holder, src;

            for (; -1 < index; index--) {
                if (type === scripts[index].type) {
                    matches.push(scripts[index]);
                }
            }
            for (; script = matches.pop() ;) {
                replaceElement(script, holder = createHolder());
                if (src = script.getAttribute('src')) {
                    appendElement(renderParser, createElement('script')).src = src;
                }
                appendElement(renderParser, script);
                addContent(renderParser.innerHTML, holder.id = lazyPrefix + seed++);
                renderParser.innerHTML = '';
            }
        }
    };

}, function(){
    eval.apply(window, arguments);
}, window, document, /*@cc_on!@*/!1));

if (!window.console) console = {};
if (!console.log) console.log = window.opera ? opera.postError : function(){};
console.clear && console.clear();
