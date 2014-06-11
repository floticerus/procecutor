/** nodbee Procecutor constructor
 *  2014 kevin von flotow
 *
 *  environmentally friendly child process pooling for node.js
 */
 ( function ()
    {
        var PATH = require( 'path' )

        var FORK = require( 'child_process' ).fork

        var UID = 0

        var CALLBACKS = {}

        // private methods for Procecutor

        // add process to instance
        function Procecutor_add( num )
        {
            // set default num as 1
            num = typeof num !== 'undefined' ? num : 1

            // make sure the limit hasn't been reached
            if ( this.count >= this.opts.max )
            {
                return // something
            }

            // create and push if we're just adding one
            if ( num === 1 )
            {
                return Procecutor_createChild.call( this )
            }

            var that = this

            while ( num-- > 0 )
            {
                Procecutor_createChild.call( that )
            }
        }

        function Procecutor_addCount()
        {

        }

        function Procecutor_checkBestPid( pid )
        {
            if ( !this.best || ( this.processes[ pid ] && this.processes[ pid ].count < this.best.count ) )
            {
                this.best = this.processes[ pid ]

                // new best was set
                return true
            }

            // best was not set
            return false
        }

        function Procecutor_checkBest()
        {
            // check if best has 0 processes running
            if ( this.best.count === 0 )
            {
                return
            }

            // pid not set, loop
            for ( var key in this.processes )
            {
                if ( Procecutor_checkBestPid.call( this, key ) )
                {
                    // stop looping if count is at 0
                    if ( this.best.count === 0 )
                    {
                        break
                    }
                }
            }

            // check if we should spawn a new process
            if ( this.best.count > 0 )
            {
                Procecutor_add.call( this, 1 )
            }
        }

        function Procecutor_createChild()
        {
            if ( this.count + 1 >= this.max )
            {
                return // something
            }

            var child = new Child( FORK( this.opts.path, this.opts.args, this.opts.opts ),
                {
                    sleep: this.opts.timeout
                },
                // send creator
                this
            )

            var that = this

            // add event handling
            child.child
                .on( 'message', function ( message )
                    {
                        if ( message.name && message.name === 'procecutor_callback' && message.uid && CALLBACKS[ message.uid ] )
                        {
                            CALLBACKS[ message.uid ]( message.err, message.result )

                            delete CALLBACKS[ message.uid ]

                            if ( child.count > 0 )
                            {
                                child.count--

                                Procecutor_checkBestPid.call( that, child.child.pid )
                            }

                            _activity.call( child, Child_idleFunc )
                        }
                    }
                )

                .on( 'error', function ( err )
                    {
                        console.log( err )
                    }
                )

                .on( 'exit', function ( code, signal )
                    {
                        if ( signal )
                        {
                            // killed by signal, might not want to spawn a new process here
                            console.log( 'procecutor: process was killed by signal: ' + signal )

                            if ( this.count > 0 )
                            {
                                this.count--
                            }
                        }
                        else if ( code !== 0 )
                        {
                            // crash!
                            console.log( 'procecutor: process exited with error code: ' + code )

                            if ( this.count > 0 )
                            {
                                this.count--
                            }

                            // attempt to fork a new process
                            Procecutor_add.call( that, 1 )
                        }
                        else
                        {
                            // process exited normally
                            // no need to lower count because it should have already been lowered
                            console.log( 'normal exit' )
                        }

                        Procecutor_checkBest.call( that )
                    }
                )

            this.processes[ child.child.pid ] = child

            this.count++

            Procecutor_checkBestPid.call( this, child.child.pid )

            return child
        }

        // remove process from instance
        function Procecutor_remove( num )
        {
            // default num is 1
            num = typeof num !== 'undefined' ? num : 1

            // shift to remove older processes first - they're probably using more memory at this point
            // OR loop through children and remove those with the highest memory usage
            // ^ it seems that getting memory usage a ChildProcess is harder than i thought

            var keys = Object.keys( this.processes )

            // num is desired number of children to remove - stop if only one is left
            while ( num-- > 0 )
            {
                var key = keys.pop()

                Child_end.call( this.processes[ key ] )
            }
        }

        // runs fn when idle is detected
        function _setIdleTimer( fn )
        {
            var that = this

            this.idleTimer = setTimeout( fn, that.opts.sleep )
        }

        function _startIdleTimer( fn )
        {
            // stop the timer if it exists
            if ( this.idleTimer )
            {
                clearTimeout( this.idleTimer )
            }

            // start the idle timer
            _setIdleTimer.call( this, fn.bind( this ) )
        }

        function _activity( fn )
        {
            // check that that the number is in range, otherwise don't set the idle timer
            if ( this.opts.sleep < Infinity && this.opts.sleep >= 0 )
            {
                _startIdleTimer.call( this, fn )
            }
        }

        // slow down to a single child process
        function Procecutor_idleFunc()
        {
            Procecutor_remove.call( this, this.count - 1 )
        }

        // end this child process
        function Child_idleFunc()
        {
            // console.log( this )
            Child_end.call( this )
        }

        function Child_end()
        {
            // only remove if there are 2 or more processes
            if ( this.creator.count < 2 )
            {
                return
            }

            // remove reference from creator instance
            if ( this.creator.processes[ this.child.pid ] )
            {
                delete this.creator.processes[ this.child.pid ]
            }

            this.creator.count--

            this.child.send( 'exit' )
        }

        /** @constructor */
        function Child( child, opts, creator )
        {
            if ( !child )
            {
                return console.log( 'procecutor: child process is not defined' )
            }

            this.child = child

            this.count = 0

            this.opts = opts || {}

            this.opts.sleep = typeof this.opts.sleep !== 'undefined' ? this.opts.sleep : 60 * 1000

            this.creator = creator

            _activity.call( this, Child_idleFunc )
        }

        /** @constructor */
        function Procecutor( opts )
        {
            // index of the process that currently has the least activity
            // right now this is just the child with the fewest functions executing
            this.best = null

            // make sure opts is an object
            this.opts = opts || {}

            // return if path isn't set
            if ( !this.opts.path )
            {
                return // something
            }

            // minimum number of wanted processes
            this.opts.min = typeof this.opts.min !== 'undefined' ? this.opts.min : 2

            // maximum number of processes
            this.opts.max = typeof this.opts.max !== 'undefined' ? this.opts.max : 10

            // slow down to a single process after this amount of idle time
            // fire back up as needed - try to keep 1 empty process if possible
            // for example, if a new process is needed, create 2
            // go green, save the planet, etc
            this.opts.sleep = typeof this.opts.sleep !== 'undefined' ? this.opts.sleep : 300 * 1000 // 5 minutes

            // end an individual process if it has been idle for this amount of time
            this.opts.timeout = typeof this.opts.timeout !== 'undefined' ? this.opts.timeout : 2 * 1000 // 1 minute

            // args to pass to the child process
            this.opts.args = this.opts.args || null

            // options to pass to the child process
            this.opts.opts = this.opts.opts || null

            // keep track of processes
            this.processes = {}

            // keep track of the number of processes manually to avoid looping
            this.count = 0

            this.idle = false

            // start the minimum number of wanted processes
            Procecutor_add.call( this, this.opts.min )

            // _startIdleTimer.call( this, Procecutor_idleFunc )

            _activity.call( this, Procecutor_idleFunc )
        }

        // public static class
        Procecutor.child = require( PATH.join( __dirname, 'child' ) )

        // public instance method
        Procecutor.prototype.exec = function ( eventName, data, callback )
        {
            // make data optional, replace as callback if it's a function
            if ( !callback && data && typeof( data ) === 'function' )
            {
                callback = data

                data = null
            }

            this.best.count++

            CALLBACKS[ ++UID ] = callback

            this.best.child.send(
                {
                    name: eventName,

                    data: data,

                    uid: UID
                }
            )

            _activity.call( this, Procecutor_idleFunc )

            Procecutor_checkBest.call( this )

            // chainable
            return this
        }

        // dynamically set options - recommended to use this instead of instance.opts directly
        Procecutor.prototype.set = function ( key, val )
        {
            if ( this.opts.hasOwnProperty( key ) )
            {
                this.opts[ key ] = val
            }
            else
            {
                console.log( "Procecutor: tried to set '" + key + "' but it is not a valid option" )
            }

            // chainable
            return this
        }

        // pass constructor
        module.exports = Procecutor
    }
)()
