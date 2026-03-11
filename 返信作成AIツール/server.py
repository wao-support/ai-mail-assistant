import http.server
import socketserver
import json
import csv
import os
from datetime import datetime

PORT = 8000
FEEDBACK_FILE = "feedback.csv"
USAGE_LOG_FILE = "usage_log.csv"

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/feedback':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                name = data.get('name', '名無し')
                message = data.get('message', '')
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                # Check if file exists to write headers
                file_exists = os.path.isfile(FEEDBACK_FILE)
                
                with open(FEEDBACK_FILE, mode='a', newline='', encoding='utf-8') as file:
                    writer = csv.writer(file)
                    if not file_exists:
                        writer.writerow(['Timestamp', 'Name', 'Message'])
                    writer.writerow([timestamp, name, message])
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
        
        elif self.path == '/api/log':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                feature = data.get('feature', 'Unknown')
                category = data.get('category', '-')
                tone = data.get('tone', '-')
                has_instructions = data.get('hasInstructions', False)
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                # Check if file exists to write headers
                file_exists = os.path.isfile(USAGE_LOG_FILE)
                
                with open(USAGE_LOG_FILE, mode='a', newline='', encoding='utf-8') as file:
                    writer = csv.writer(file)
                    if not file_exists:
                        writer.writerow(['Timestamp', 'Feature', 'Category', 'Tone', 'HasInstructions'])
                    writer.writerow([timestamp, feature, category, tone, has_instructions])
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))

        else:
            self.send_response(404)
            self.end_headers()

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    print(f"Serving at port {PORT} with feedback API...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
