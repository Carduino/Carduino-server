var app = require('express')(),
	logger = require('morgan'),
	bodyParser = require('body-parser'),
	mongoose = require('mongoose'),
	jwt = require('jsonwebtoken'),
	socketioJwt = require("socketio-jwt");

app.use(logger('dev'))
	.use(bodyParser.json())
	.use(bodyParser.urlencoded({
		extended: false
	}));

var prodDB = (process.env.DB != 'local') ? true : false;



//----- MONGOOSE ORM FOR MONGO-DB -----//

var MongooseOptions = {
	server: {
		poolSize: 5,
		socketOptions: {
			keepAlive: 1
		}
	},
	replset: {
		socketOptions: {
			keepAlive: 1
		}
	},
	db: {
		native_parser: true
	}
};

if (prodDB) {
	MongooseOptions.user = 'Carduino-server'; // a user authorized to access 'carduino' db with ReadWrite permissions
	MongooseOptions.pass = 'carduinopwd';
}

mongoose.connect('mongodb://localhost/carduino', MongooseOptions);



//----- MONGOOSE MODELS/SCHEMAS -----//

var User = require('./models/user');

/* CREATE THE INITIAL USER
var user = new User({
	username: 'login',
	password: 'pwd',
	role: 'admin'
});

user.save(function(err) {
	if (!err) console.log('Success saving the user!');
	else console.log(err);
});
*/

User.find({}, function(err, user) {
	console.log(user);
});



function createToken(user, rememberme, callback) {
	// sign the jwt asynchronously with HMAC using SHA-256 hash algorithm
	jwt.sign({
		name: user.name,
		role: user.role
	}, 'pwd', {
		algorithm: 'HS256',
		expiresIn: rememberme ? 60 * 60 * 24 * 30 : 60,
		issuer: 'Carduino-server'
	}, function(token) {
		callback(token);
	});
}

function credentialsAuth(credentials, callback) {
	User.findOne({
		username: credentials.username
	}, function(err, user) {
		if (!err && user) {
			user.verifyPassword(credentials.password, function(err, valid) {
				if (!err && valid) {
					createToken(user, credentials.rememberme, function(token) {
						callback(null, token);
					});
				} else callback(err);
			});
		} else callback(err);
	});
}

var networkTree = [];



//----- SOCKET.IO -----//
app.io = require('socket.io')();
app.io.set('transports', ['websocket']);
var io = app.io;



io.on('connect', function() {
	console.log('!!!connect fired!');
	socket.on('disconnect', function() {
		console.log('disconnect fired eeeeee!!!!!!!');
		if (socket.decoded_token.role === 'hub') {
			// Remove hub from the network tree
			var hubIndex = networkTree.findIndex(function(hub) {
				return hub.name === socket.decoded_token.name;
			});
			if (hubIndex > -1) {
				networkTree.splice(hubIndex, 1);
			}
			// Push the event to thru the users sockets
			io.to('users').emit('removeNode', socket.decoded_token.name);
		}
	});
});

io.on('connection', socketioJwt.authorize({
	secret: 'pwd',
	//timeout: 5000, // 15 seconds to send the authentication message
	required: false
}));

io.on('connection', function(socket) {
	socket.on('credentialsAuth', function(credentials) {
		console.log(credentials.username);
		console.log(credentials.password);
		console.log(credentials.rememberme);
		credentialsAuth(credentials, function(err, token) {
			if (!err && token) {
				socket.emit('validCredentials', token);
				console.log(token);
			} else socket.emit('invalidCredentials');
		});
	});
	socket.on('disconnect', function() {
		console.log('disconnect fired !!!!!!!');
		if (socket.decoded_token.role === 'hub') {
			// Remove hub from the network tree
			var hubIndex = networkTree.findIndex(function(hub) {
				return hub.name === socket.decoded_token.name;
			});
			if (hubIndex > -1) {
				networkTree.splice(hubIndex, 1);
			}
			// Push the event to thru the users sockets
			io.to('users').emit('removeNode', socket.decoded_token.name);
		}
	});
	socket.on('reconnect', function() {
		console.log('reconnect fired!');
	});
});

io.on('authenticated', function(socket) {
	// Join the socket to the appropriate room
	if (socket.decoded_token.role === 'user' || socket.decoded_token.role === 'admin') socket.join('users');
	if (socket.decoded_token.role === 'admin') socket.join('admins');
	if (socket.decoded_token.role === 'hub') socket.join('hubs');
	console.log('authenticated');



	//----- COMMUNICATIONS WITH AUTHENTICATED SOCKETS -----//

	// Communications with hubs
	if (socket.decoded_token.role === 'hub') {
		// Get the hub name
		var hubName = socket.decoded_token.name;

		// Receive datas refering to the connection of a hub and the associated sensors
		socket.on('newHub', function(hub) {
			console.log('new hub !');
			// add the new hub and the associated sensors to the network tree
			networkTree.push(hub);
			// Format and push the event to thru the users sockets
			var addNode = {
				parentNodeName: 'Carduino-server',
				node: hub
			};
			io.to('users').emit('addNode', addNode);
		});

		// Log the lost of connection with a hub
		socket.on('disconnect', function() {
			console.log('hub lost !');
			// Remove hub from the network tree
			var hubIndex = networkTree.findIndex(function(hub) {
				return hub.name === hubName;
			});
			if (hubIndex > -1) {
				networkTree.splice(hubIndex, 1);
			}
			// Push the event to thru the users sockets
			io.to('users').emit('removeNode', hubName);
		});

		// Log a new sensor connection
		socket.on('newSensor', function(sensor) {
			console.log('new sensor !');
			// add the sensor to the network tree
			var hubIndex = networkTree.findIndex(function(hub) {
				return hub.name === hubName;
			});
			if (hubIndex > -1) {
				networkTree[hubIndex].children.push(sensor);
			}

			// Format and push the event to thru the users sockets
			var addNode = {
				parentNodeName: hubName,
				node: sensor
			};
			io.to('users').emit('addNode', addNode);
		});

		// Log the lost of connection with a sensor
		socket.on('sensorLost', function(sensorName) {
			console.log('sensor lost !');
			// remove the sensor from the network tree and push the event thru the users sockets
			var hubIndex = networkTree.findIndex(function(hub) {
				return hub.name === hubName;
			});
			if (hubIndex > -1) {
				var sensorIndex = networkTree[hubIndex].children.findIndex(function(sensor) {
					return sensor.name === sensorName;
				});
				if (sensorIndex > -1) {
					networkTree[hubIndex].children.splice(hubIndex, 1);
				}
			}
			io.to('users').emit('removeNode', sensorName);
		});

		// Receive datas of each sensor connected to the emiting hub
		socket.on('sensorData', function(sensorData) {
			// add datas to the database and push it to the client
			// ...
			console.log(sensorData);
			//io.to('users').emit('sensorsDatas', sensorsDatas);
			io.to('users').emit('sensorData', sensorData);
		});
	}

	// Communications with users
	else {
		socket.emit('refreshInterface', {
			networkTree: networkTree
				// ... À compléter
				// ...
				// ...
		});

		// ... À compléter
		// ...
		// ...

		// Communication with admin users
		if (socket.decoded_token.role === 'admin') {
			// ... À compléter
			// ...
			// ...
		}
	}

});



app.get('/', function(req, res) {
	res.send('Carduino-server');
});



// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use(function(err, req, res, next) {
		res.status(err.status || 500);
		res.render('error', {
			message: err.message,
			error: err
		});
	});
}
// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: {}
	});
});


module.exports = app;
