var https = require('https');
var cheerio = require('cheerio');
var robot = require('robot-js');
var moment = require('moment');

var mouseController = robot.Mouse;
var mouse = new robot.Mouse();

var keyboard = new robot.Keyboard();

var clipboard = robot.Clipboard;

var screen = robot.Screen;

var helper = {
    exe: commands => {
        if(!commands) return;
        if(!Array.isArray(commands)) commands = [commands];
        if(commands.length == 0) return;
        var command = commands[0];
        if(!command.args) command.args = [];
        if(!Array.isArray(command.args)) command.args = [command.args];
        var f = helper[command.f];
        let args = command.args;
        if(commands.length > 1) args.push(() => {
            setTimeout(() => {
                helper.exe(commands.slice(1));
            }, command.timeout || 100);
        });
        if(f) f.apply(this, command.args);
    },

    click: (x, y, cb) => {
        console.log("click", x, y);
        mouseController.setPos(x, y);
        setTimeout(() => {
            mouse.click(0);
            if(cb && typeof cb == 'function') cb();
        }, 10);
    },

    type: (str, cb) => {
        console.log('type', str);
        keyboard.click(str);
        if(cb && typeof cb == 'function') cb();
    },

    paste: (str, cb) => {
        console.log('paste', str);
        clipboard.setText(str);
        keyboard.press(robot.KEY_SYSTEM);
        keyboard.click('v');
        keyboard.release(robot.KEY_SYSTEM);
        if(cb && typeof cb == 'function') cb();
    },

    wait: (cb) => {
        console.log('wait');
        if(cb && typeof cb == 'function') cb();
    },

    waitColorSignal: (x, y, r, g, b, cb) => {
        console.log(`wait r=${r} g=${g} b=${b} at x=${x} y=${y}`);
        let found = false;
        while (!found) {
            let image = robot.Image(1, 1);
            let success = screen.grabScreen(image, x, y, 1, 1);
            let color = image.getPixel(0, 0);
            if(color.r == r && color.g == g && color.b == b) found = true;
        }
        if(cb && typeof cb == 'function') cb();
    },
};

var trigger = moment().add(10, 's');

function testSchedulingAvailable(cb) {
    let now = Date.now();
    https.get('https://ru.ct.ufrj.br/list/descriptions', res => {
        var ping = Date.now()-now;
        console.log('GOT status', res.statusCode, ping, 'ms');
        res.setEncoding('utf8');

        res.on('data', chunk => {
            // console.log('chunk loaded');
            var $ = cheerio.load(chunk);
            var rows = $('.table tbody').children().length;
            // console.log(rows, 'rows');
            if(rows > 4) {
                console.log('Scheduling available!');
                if(cb && typeof cb == 'function') cb();
            } else {
                console.log('Scheduling not available. Retrying...');
                testSchedulingAvailable(cb);
            }
        });
    }).on('error', e => {
        console.error(e.message);
    });
}

function getTimePositions(h, m, xBase) {
    let yBase = 640;

    let dw = 50;
    let dh = 30;

    let x = h%4;
    let y = Math.floor(h/4);
    let hourPos = [x*dw + xBase, y*dh + yBase];

    m = Math.floor(m/5);
    x = m%4;
    y = Math.floor(m/4);
    let minPos = [x*dw + xBase, y*dh + yBase];

    return {
        hour: hourPos, 
        min: minPos
    };
}

function getXs(n) {
    if(n == 1) return [3140];//[2360];
    if(n == 2) return [2000, 3075];
}

function getXs2(yBase) {
    let image = robot.Image(2*1920, 40);
    let success = screen.grabScreen(image, 0, yBase, 2*1920, 40);

    const isNotButton = function(img, x) {
        for(let j=0; j<img.getHeight(); j++) {
            let color = image.getPixel(x, j);
            if(color.r == 33 && color.g == 150 && color.b == 243) {
                return false;
            }
        }
        return true;
    }

    let xBases = [];

    let onButton = false;
    for(let i=0; i<image.getWidth(); i++) {
        if(!isNOTButton(img, i)) {
            if(!onButton) {
                xBases.push(i+60);
            }
            onButton = true;
        } 
        else onButton = false;
    }

    return xBases;
}

function getBasePos() {
    let image = robot.Image(2*1920, 1080);
    let success = screen.grabScreen(image, 0, 0, 2*1920, 1080);
    let x, y;
    out: for(let i=0; i<image.getWidth(); i+=1) {
        for(let j=0; j<image.getHeight(); j+=1) {
            let color = image.getPixel(i, j);
            if(color.r == 33 && color.g == 150 && color.b == 243) {
                x = i;
                y = j;
                break out;
            }
        }
    }
    
    return {x: x, y: y};
}

function schedule(cpfs, hours, mins) {
    if(!Array.isArray(cpfs)) cpfs = [cpfs];
    let base = getBasePos();

    // let xBases = getXs(cpfs.length);
    let xBases = getXs2(base.y);

    let genY = 0;
    let image = robot.Image(1, 1000);
    let success = screen.grabScreen(image, xBases[i], 0, 1, 1000);
    for(let j=0; j<image.getHeight(); j+=10) {
        let color = image.getPixel(0, j);
        if(color.r == 33 && color.g == 150 && color.b == 243) {
            genY = j;
            break;
        }
    }

    console.log('scheduling', cpfs, `${hours}:${min}`);
    
    let commands = [];
    
    for(let i=0; i<cpfs.length; i++) {
        // Chrome
        commands.push({f: 'click', args: [xBases[i]-60, 500], timeout: 1000});

        // Generate
        commands.push({f: 'click', args: [xBases[i], genY], timeout: 500});
    }

    commands.push({f: 'waitColorSignal', args: [xBases[xBases.length-1], 430, 255, 224, 178], timeout: 500});

    for(let i=0; i<cpfs.length; i++) {
        // Chrome
        commands.push({f: 'click', args: [xBases[i]-60, 500], timeout: 100});

        // Captcha
        // commands.push({f: 'click', args: [xBases[i], 700], timeout: 2000/cpfs.length});
    }

    for(let i=0; i<cpfs.length; i++) {
        // Chrome
        commands.push({f: 'click', args: [xBases[i]-60, 500], timeout: 1});
        
        // CPF
        commands.push({f: 'click', args: [xBases[i], 500], timeout: 1});
        commands.push({f: 'paste', args: [cpfs[i].toString()], timeout: 1});

        // Horario
        let timePos = getTimePositions(hours, mins, xBases[i]);
        commands.push({f: 'click', args: [xBases[i], 560], timeout: 1});
        commands.push({f: 'click', args: timePos.hour, timeout: 1});
        commands.push({f: 'click', args: timePos.min, timeout: 1});
        
        // Send
        // commands.push({f: 'click', args: [xBases[i], 800], timeout: 500});
    }

    helper.exe(commands);

}

// let mousePos = mouseController.getPos();
// console.log(mousePos);

// let image = robot.Image(1, 1);
// let success = screen.grabScreen(image, mousePos.x, mousePos.y, 1, 1);
// if(success) {
//     console.log(image.getPixel(0, 0));
// } else {
//     console.error('error grabbing screen');
// }

// testSchedulingAvailable(() => {
    schedule([14862997767], 11, 20);
// });