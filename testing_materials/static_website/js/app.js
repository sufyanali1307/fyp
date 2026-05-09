// Simulate backend connection logs
const lines = [
    "[System] Nexus Edge network initialized",
    "[Network] BGP routes optimized in 14 regions",
    "[Cache] Edge CDN populated successfully 100%",
    "[Security] WAF Rules applied against OWASP Top 10",
    "[Ready] Serving traffic on port :80",
    "[Log] Worker process started"
];

const consoleOutput = document.getElementById('console-output');
const latencyDisplay = document.getElementById('latency-display');

function addLogLine(text, delay) {
    return new Promise(resolve => {
        setTimeout(() => {
            const div = document.createElement('div');
            div.textContent = text;
            consoleOutput.appendChild(div);
            resolve();
        }, delay);
    });
}

async function runBootSequence() {
    for (let i = 0; i < lines.length; i++) {
        await addLogLine(lines[i], 800 + Math.random() * 1000);
    }
}

// Start visual boot sequence
runBootSequence();

// Simulate dynamic edge latency
setInterval(() => {
    const baseLatency = 8;
    const fluctuation = Math.floor(Math.random() * 7);
    latencyDisplay.textContent = `~${baseLatency + fluctuation}ms`;
}, 2000);
