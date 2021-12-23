'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const EventEmitter = require('events');

module.exports = class Process extends EventEmitter
{
    #process; #command; #options = {}; #running_options = {}; #started; #status = 'stopped';

    constructor( command, options = {})
    {
        super();

        this.#command = command;
        this.#options = options;
    }

    start( running_options = {})
    {
        this.#running_options = running_options;

        return new Promise(( resolve, reject ) =>
        {
            if( this.#status !== 'stopped' ){ return resolve( this )} //TODO ulozit predchadzajuci start promise a vracat ten ak je starting

            this.#status = 'starting';

            const { args, ...spawn_options } = this.#options;

            this.#process = spawn( this.#command, args || [], spawn_options );/*
            {
                cwd: __dirname + '/../test',
                uid: 1001,
                stdio: 'ignore',
                env :
                {
                    NODE_ENV: 'production'
                }
            });*/

            //this.#process.stdout.on( 'data', data => console.log( data.toString() ) );
            //this.#process.stderr.on( 'data', data => console.error( data.toString() ) );

            this.#process.on( 'spawn', () => 
            {
                this.#status = 'running';
                this.#started = new Date();

                this.emit( this.#status );
                
                resolve( this );
            });

            this.#process.on( 'exit', ( code, signal ) => 
            {
                this.#status = 'stopped';
                this.#started = undefined;
                this.#process = undefined;

                this.emit( this.#status );

                console.error( 'exit', code, signal );

                if( this.#running_options.restart ) // TODO nerestartovat ked sme manualne stopli
                {
                    this.start( this.#running_options );
                }
            });
        });
    }

    async restart( options = {})
    {
        await this.stop( options.signal );
        await this.start( this.#running_options );
    }

    stop( options = {})
    {
        return new Promise(( resolve, reject ) =>
        {
            if( this.#status === 'stopped' ){ return resolve() }

            this.#process.once( 'exit', () => resolve());
            this.#process.kill( options.signal );
        });
    }
    
    stats()
    {
        return new Promise(( resolve, reject ) =>
        {
            fs.readFile( '/proc/' + this.#process.pid + '/stat', 'utf8', ( err, data ) =>
            {
                if( err ){ return reject( err )}

                data = data.substr( data.lastIndexOf(')') + 2 ).split(' ');

                const clockTick = 100;// getconf CLK_TCK
                const pageSize = 4096;// getconf PAGESIZE

                resolve(
                {
                    //ppid    : parseInt(data[1]),
                    utime   : parseFloat(data[11]),
                    stime   : parseFloat(data[12]),
                    cutime  : parseFloat(data[13]),
                    cstime  : parseFloat(data[14]),
                    start   : this.#started, //parseFloat(data[19]) / clockTick,
                    rss     : parseFloat(data[21]),
                    memory  : parseFloat(data[21]) * pageSize
                });
            });
        })
    }
}

//sudo lscpu 
//CPU(s)
//BogoMIPS