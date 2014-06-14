/** nodbee Procecutor child module
 *  2014 kevin von flotow
 *
 *  environmentally friendly child process pooling for node.js
 */
( function ()
	{
		var PROCESSES = {}

		function _done( uid, name )
		{
			return function ( err, result )
			{
				process.send(
					{
						name: 'procecutor_callback',

						uid: uid,

						err: err,

						result: result
					}
				)
			}
		}

		process.on( 'message', function ( message )
			{
				if ( message.name && PROCESSES[ message.name ] )
				{
					PROCESSES[ message.name ]( message.data, _done( message.uid, message.name ) )
				}
				else if ( message === 'exit' )
				{
					process.exit()
				}
			}
		)

		function _on( eventName, fn )
		{
			// make sure it's a function
			if ( typeof fn === 'function' )
			{
				PROCESSES[ eventName ] = fn
			}

			// return this to be chainable
			return this
		}

		module.exports = { on: _on }
	}
)()
