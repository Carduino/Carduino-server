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



// sign the jwt asynchronously with HMAC using SHA-256 hash algorithm
jwt.sign({
	name: 'Vincent'
}, 'pwd', {
	algorithm: 'HS256',
	expiresIn: 180000,
	issuer: 'Carduino-server'
}, function(token) {
	console.log(token);
});



var prodDB = (process.env.DB != 'local') ? true : false;



//----- MONGOOSE ORM FOR MONGO-DB -----//
var MongooseLocalOptions = {
	server: {
		poolSize: 5
	},
	replset: {}, //{ rs_name: 'myReplicaSetName' }
	db: {
		native_parser: true
	}
};

var MongooseProdOptions = {
	user: 'Carduino-server', // a user authorized to access 'neocreators' db with ReadWrite permissions
	pass: 'carduinopwd',
	server: {
		poolSize: 5
	},
	replset: {}, //{ rs_name: 'myReplicaSetName' }
	db: {
		native_parser: true
	}
};


//to solve some keepalive problems
MongooseOptions.server.socketOptions = MongooseOptions.replset.socketOptions = {
	keepAlive: 1
};
if (!prod) mongoose.connect('mongodb://localhost/carduino', MongooseLocalOptions);
else mongoose.connect('mongodb://localhost/carduino', MongooseProdOptions);



//----- MONGOOSE MODELS/SCHEMAS -----//

var User = require('./models/user');
/*
var user = new User({
	username: 'login',
	password: 'pwd'
});


user.save(function(err) {
	if (!err) console.log('Success saving the user!');
	else console.log(err);
});

User.find({}, function(err, profile) {
	console.log(profile);
	console.log(err);
});


User.findOne({
	username: 'login4'
}, function(err, profile) {
	if (!err) console.log(profile);
	else console.log(err);
	profile.verifyPassword('pwd4', function(err, valid) {
		if (!err)
			console.log(valid ? "ValidAsync !!!" : "InvalidAsync"); //=>'ValidAsync'
	});
});
*/

function createToken(user, rememberme, callback) {
	jwt.sign({
		//name: user.name
		//rememberme: rememberme
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



//----- SOCKET.IO -----//
app.io = require('socket.io')();
var io = app.io;


io.on('connection', socketioJwt.authorize({
	secret: 'pwd',
	//timeout: 5000, // 15 seconds to send the authentication message
	required: false
}));



io.on('authenticated', function(socket) {
	//this socket is authenticated, we are good to handle more events from it.
	console.log('hello! ' + socket.decoded_token.name);
});



io.on('connect', function() {
	console.log('!!!connect fired!');
});



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
		console.log('disconnect fired!');
	});
	socket.on('reconnect', function() {
		console.log('reconnect fired!');
	});
	socket.on('beforeAuth', function() {
		console.log('message avant auth !!!');
	});
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
