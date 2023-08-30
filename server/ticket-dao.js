'use-strict';

const Queue = require('queue-fifo');
const dayjs = require('dayjs');

const activeClient = 0;

function Ticket(sessionId){
    this.sessionId = sessionId;
    this.created_ad = dayjs();
}

function TicketQueue(){
    this.queue = new Queue();
    this.activeClient = 0;
    this.enqueue = ticket => { this.queue.enqueue(ticket); } 
    this.dequeue = () => { this.queue.dequeue(); }
    this.empty = () => this.queue.isEmpty();
}

exports.ticketQueue = TicketQueue;
exports.Ticket = Ticket;
exports.activeClient = activeClient;


