<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GH Schools Developer Portal</title>
    
    <!-- Fonts & Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    
    <!-- Reusing existing styles for consistency -->
    <link rel="stylesheet" href="../style.css">
    <link rel="stylesheet" href="developer.css">
    <link rel="stylesheet" href="settings.css"> 

    <style>
        /* Specific Public Layout Overrides */
        body {
            background: #f8fafc;
            height: auto; /* Allow scrolling */
            overflow-y: auto;
        }
        
        .public-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .public-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 0;
            margin-bottom: 40px;
            border-bottom: 1px solid #e2e8f0;
        }

        .brand {
            font-size: 1.5rem;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .brand i { color: #2563eb; }
    </style>
</head>
<body>

    <div class="public-container">
        <!-- Public Header -->
        <header class="public-header">
            <div class="brand">
                <i class="fas fa-layer-group"></i>
                GH Schools API
            </div>
            <div>
                <a href="mailto:support@ghschools.online" class="btn-retry" style="text-decoration:none;">
                    <i class="fas fa-envelope"></i> Contact Support
                </a>
            </div>
        </header>

        <!-- Main Content Area -->
        <div>
            <div style="margin-bottom: 30px; text-align: center;">
                <h1 style="font-size: 2.5rem; color: #1e293b; margin-bottom: 10px;">Developer Documentation</h1>
                <p style="color:#64748b; font-size: 1.1rem;">Complete reference and testing tools for the Student Verification API.</p>
            </div>

            <!-- Tabs -->
            <div class="tabs-header" style="justify-content: center;">
                <button class="tab-btn active" onclick="switchTab('docs')" id="btn-docs">Documentation</button>
                <button class="tab-btn" onclick="switchTab('sandbox')" id="btn-sandbox">API Sandbox</button>
            </div>

            <!-- VIEW 1: Documentation -->
            <div id="view-docs" class="doc-section" style="margin: 0 auto;">
                <div style="text-align:right;">
                    <button onclick="window.print()" class="btn-retry"><i class="fas fa-print"></i> Print Guide</button>
                </div>

                <h1>Student Verification API</h1>
                <p><strong>Version 1.0</strong> | Secure REST API for Banking Partners</p>
                
                <h2>1. Authentication</h2>
                <p>Include your unique API Key in the request header. Do not share this key.</p>
                <div class="code-block">X-API-Key: sk_live_xxxxxxxxxxxxxxxxxxxxxxxx</div>

                <h2>2. Endpoint</h2>
                <div class="code-block">POST <span id="docUrl">...loading...</span></div>

                <h2>3. Request Format</h2>
                <div class="code-block">{
  "student_id": "GHMS25101"
}</div>

                <h2>4. Response Codes</h2>
                <ul>
                    <li><strong>200 OK:</strong> Student found.</li>
                    <li><strong>401 Unauthorized:</strong> Invalid API Key.</li>
                    <li><strong>404 Not Found:</strong> Student ID does not exist.</li>
                    <li><strong>429 Too Many Requests:</strong> Rate limit exceeded.</li>
                </ul>
            </div>

            <!-- VIEW 2: Sandbox -->
            <div id="view-sandbox" style="display:none;">
                <div class="sandbox-grid">
                    <!-- Request Panel -->
                    <div class="sandbox-panel">
                        <h3 style="margin-bottom:15px;">Send Request</h3>
                        
                        <label class="setting-label">Target URL</label>
                        <input type="text" id="sandboxUrl" class="setting-input" readonly style="color:#64748b; margin-bottom:15px;">

                        <label class="setting-label">API Key</label>
                        <input type="password" id="sandboxKey" class="setting-input" placeholder="Paste sk_live_..." style="margin-bottom:15px;">
                        <small style="color:#64748b; display:block; margin-top:-10px; margin-bottom:15px;">Use the valid key provided by the Admin.</small>

                        <label class="setting-label">Student ID</label>
                        <input type="text" id="sandboxId" class="setting-input" placeholder="e.g. GHMS25101" style="margin-bottom:20px;">

                        <button onclick="runTest()" class="btn-primary" id="testBtn">
                            <i class="fas fa-paper-plane"></i> Send Request
                        </button>
                    </div>

                    <!-- Response Panel -->
                    <div class="sandbox-panel" style="background:#0f172a; border:none;">
                        <h3 style="color:white; margin-bottom:15px;">Response</h3>
                        <div id="sandboxOutput" class="response-window">// JSON Output will appear here...</div>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Logic (No Auth Required) -->
    <script src="developer.js"></script>
</body>
</html>