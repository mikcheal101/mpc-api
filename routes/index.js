module.exports = function (io, upload) {

	var express 	= require ('express');
	var bcrypt 		= require ('bcryptjs');
	

	var router 		= express.Router();
	
	var pg 			= require ('pg'); 
	//var conn 		= 'postgres://postgres:mikkytrionze@localhost/mpc';
	var conn 		= 'postgres://jykvfzuwgldjrh:0z5TvaiKiuio_ias5BsiNc9fRA@ec2-54-75-233-92.eu-west-1.compute.amazonaws.com:5432/da4aimod31eto2';

	/* GET home page. */
	router.get('/api', function(req, res, next) {
		res.render('index', { title: 'mpc-api' });
	});

	router.post ('/api/loadOlderMessages', (req, res, next) => {
		var messages = [];
		io.sockets.emit ('loading-past-messages');  

		if (req.body.least_id) {
			pg.connect (conn, function (err, db) {
				var sql 	= `SELECT messages.id, messages.text, messages.ts, messages.type, customers.email, customers.imageurl, customers.fullname, 
					customers.lastlogin, customers.createdat FROM messages LEFT JOIN customers ON messages.author=customers.id 
					WHERE messages.id < $1 ORDER BY messages.ts DESC LIMIT 10`;
				
				var query	= db.query (sql, [req.body.least_id]);
				query.on ('row', (row) => {
				 	messages.push (row);
				});
				query.on ('end', () => {
				 	io.sockets.emit ('loaded-past-messages', {messages:messages});
				 	res.status (200).json ({
				 		message:'loaded Future messages',
				 		data:messages
				 	})
				});
			});
			
		} else {
			io.sockets.emit ('past-messages-error');
			res.status (404).json ({
				message:'no such page',
				data:messages
			});
		}
		
	});

	router.get ('/api/messages', (req, res, next) => {
		io.sockets.emit ('loading-messages');

		var messages = [];
		pg.connect (conn, function (err, db) {
			var sql 	= `SELECT messages.id, messages.text, messages.ts, messages.type, customers.email, customers.imageurl, customers.fullname, 
				customers.lastlogin, customers.createdat FROM messages LEFT JOIN customers ON messages.author=customers.id 
				ORDER BY messages.ts DESC LIMIT 10`;
			var query	= db.query (sql);
			query.on ('row', (row) => {
			 	messages.push (row);
			});
			query.on ('end', () => {
			 	io.sockets.emit ('loaded-messages', {messages:messages});
			 	res.status (200).json ({
			 		message:'loaded messages',
			 		data:messages
			 	})
			});
		});
	});

	router.post ('/api/saveMessage', upload.single ('upload'), (req, res, next) => {
		req.body.message = req.file ? JSON.parse (req.body.message): req.body.message;
		
		if (req.body.message) {
			
			var text = req.file ? req.file.filename : req.body.message.text;

			var message = {
				author	:req.body.message.author.id,
				text 	:text,
				ts 		:Date.now (),
				type	:req.body.message.type
			};	

			pg.connect (conn, function (e, db) {
				if (e) res.status (404).json ({
					message: 'error connecting to db',
					data: []
				});
				var sql 	= `INSERT INTO messages (author, text, type, ts) VALUES ($1,$2,$3,$4) RETURNING id`;
				var query	= db.query (sql, [message.author, message.text, message.type, message.ts]);
				query.on ('row', (row) => {
					message.id = row.id;
					message.author = req.body.message.author;
					message.imageurl = req.body.message.imageurl,
					message.fullname = req.body.message.fullname;
				});
				query.on ('end', () => {
					io.sockets.emit ('msg-recieved', {msg:message});
					res.status (200).json ({
						message:'message saved',
						data:message
					});
				});
			});
		}
	});



	router.post ('/api/verifyUser', (req, res, next) => {
		if (!!req.body.user) {
			var user = {
				id 			:req.body.user.id,
				email 		:req.body.user.email,
				imageUrl	:req.body.user.imageUrl,
				fullname	:req.body.user.fullname
			};
			pg.connect (conn, function (e, db, done) {
				if (e) res.status (404).json ({
					message: 'error connecting to db',
					data: []
				});

				const results = [];
				var select = db.query ("SELECT * FROM customers WHERE email=$1", [user.email]);
				
				select.on ('row', (row) => {
					results.push (row);
				});

				select.on ('end', () => {
					var user_  = {};

					if (results.length > 0) {
						// user exists so update details nd return id
						var update = db.query ('UPDATE customers SET imageurl=$1, lastlogin=$2 WHERE email=$3 RETURNING *', [user.imageUrl, Date.now (), user.email]);
						
						update.on ('row', (row) => {
							user_ = row;
						});

						update.on ('end', () => {
							res
							.status (200)
							.json ({
								message:'User updated!',
								data:user_
							});
						});
					} else {
						// insert new user and return id
						var insert = db.query ("INSERT INTO customers (email, imageurl, fullname, createdat, lastlogin) VALUES ($1,$2,$3,$4,$5) RETURNING *", 
							[user.email, user.imageUrl, user.fullname, Date.now (), Date.now ()]);
						insert.on ('row', (row) => {
							user_ = row;
						});
						insert.on ('end', () => {
							res
							.status (200)
							.json ({
								message:'User added!',
								data:user_
							});
						});
					} 
				});
			});
		}
	});

	return router;
}

