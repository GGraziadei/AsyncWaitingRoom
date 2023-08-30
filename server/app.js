'use strict';

const userDao = require('./user-dao'); // module for accessing the user info in the DB
const ticketManager = require('./ticket-dao');

const http = require('http');
const socketIo = require('socket.io');
const express = require('express');
const morgan = require('morgan'); // logging middleware
const { check, validationResult } = require('express-validator'); // validation middleware
const cors = require('cors');
const passport = require('passport'); // auth middleware
const LocalStrategy = require('passport-local').Strategy; // username and password for login
const session = require('express-session'); // enable sessions
const dotenv = require('dotenv');



dotenv.config();
const app = new express();
const queue = new ticketManager.ticketQueue();
const server = http.createServer(app);
const io = socketIo(server);

// set-up the middlewares
app.use(morgan('dev'));
app.use('/test', express.static('test'));
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));

/*** Set up Passport ***/
// set up the "username and password" login strategy
// by setting a function to verify username and password
passport.use(new LocalStrategy(
    function (username, password, done) {
        userDao.getUser(username, password).then((user) => {
            if (!user)
                return done(null, false, { message: 'Incorrect username and/or password.' });

            return done(null, user);
        })
    }
));

// serialize and de-serialize the user (user object <-> session)
// we serialize the user id and we store it in the session: the session is very small in this way
passport.serializeUser((user, done) => {
    done(null, { email: user.email, id: user.id });
    //Verbose strategy: id => email 
});

// starting from the data in the session, we extract the current (logged-in) user
passport.deserializeUser((session, done) => {
    const id = session.id;
    userDao.getUserById(id)
        .then(user => {
            if (session.email === user.email) {
                done(null, user); // this will be available in req.user
            } else {
                done({ error: "Email is not linked to the right user id." }, null);
            }
        }).catch(err => {
            done(err, null);
        });
});

// set up the session
app.use(session({
    secret: process.env.secret,
    resave: false,
    saveUninitialized: false
}));

//init passport
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
    res.json({
        appName: process.env.appName,
        port: process.env.port,
        session: req.session.id,
    })
});

app.get('/enqueue', (req, res) => {
    const sessionId = req.session.id;
    const ticket = new ticketManager.Ticket(sessionId);

    if (ticketManager.activeClient < process.env.slidingWindow) {
        ticketManager.activeClient += 1;
        res.json( {
            accpted: true,
            enqueued: false,
            clientId: ticketManager.activeClient
        });
    } else {
        queue.enqueue(ticket);
        res.json({
            accpted: true,
            enqueued: true,
            nextUrl: undefined,
            ticket: { ...ticket }
        });
    }
});

io.on('connection', socket => {
    console.log('WebSocket connection:', socket.id);
    socket.on('enqueue', () => {
        const sessionId = socket.id;
        const ticket = new ticketManager.Ticket(sessionId);

        if (ticketManager.activeClient < process.env.slidingWindow) {
            ticketManager.activeClient += 1;
            io.emit('message', {
                accpted: true,
                enqueued: false,
                clientId: ticketManager.activeClient
            });
        } else {
            queue.enqueue(ticket);
            io.emit('message', {
                accpted: true,
                enqueued: true,
                nextUrl: undefined,
                ticket: { ...ticket }
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

});

// activate the server
server.listen(process.env.port, () => {
    console.log(`${process.env.appName} listening at http://localhost:${process.env.port}`);
});