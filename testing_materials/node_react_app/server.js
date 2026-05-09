const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
    <html>
        <head><title>Nexus Analytics Dashboard</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial; background: linear-gradient(135deg, #1e293b, #0f172a); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); padding: 4rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 600px;">
                <h1 style="background: -webkit-linear-gradient(45deg, #a855f7, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 3rem; margin: 0 0 1rem 0;">Analytics Portal</h1>
                <p style="font-size: 1.2rem; color: #cbd5e1; line-height: 1.6;">Node.js v18 backend running successfully in your isolated container environment.</p>
                <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                    <div style="background: rgba(255,255,255,0.1); padding: 1rem 2rem; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #10b981;">99.9%</div>
                        <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8;">Uptime</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); padding: 1rem 2rem; border-radius: 8px;">
                        <div style="font-size: 2rem; font-weight: bold; color: #3b82f6;"><span id="requests">142</span></div>
                        <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8;">Requests/sec</div>
                    </div>
                </div>
            </div>
            
            <script>
                // Simulate live analytics
                setInterval(() => {
                    const reqElem = document.getElementById('requests');
                    let base = parseInt(reqElem.innerText);
                    reqElem.innerText = Math.max(100, base + Math.floor(Math.random() * 11) - 5);
                }, 2000);
            </script>
        </body>
    </html>
    `);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
