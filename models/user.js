var mongoose = require('mongoose');

var User = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		unique: true
	},
	password: {
		type: String,
		required: true,
		bcrypt: true
	},
	role: {
		type: String,
		required: true
	}
});

User.plugin(require('mongoose-bcrypt'));

module.exports = mongoose.model('User', User);
