#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <LittleFS.h>

const int LED1 = 25;
const int LED2 = 26;
const int BUTTON1 = 18;
const int BUTTON2 = 19;
const int POT = 34;
const int POT2 = 33;

const char* AP_SSID = "ArduinoPicnic";
const char* AP_PASS = "picnic123";

float flame1 = 120;
float flame2 = 120;
unsigned long lastFlicker = 0;
unsigned long lastHeartbeat = 0;
bool gameMode = false;

WebServer server(80);
WebSocketsServer ws(81);
bool wsClientConnected = false;

String getContentType(String path) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css"))  return "text/css";
  if (path.endsWith(".js"))   return "application/javascript";
  if (path.endsWith(".woff2"))return "font/woff2";
  if (path.endsWith(".png"))  return "image/png";
  if (path.endsWith(".jpg"))  return "image/jpeg";
  if (path.endsWith(".ico"))  return "image/x-icon";
  if (path.endsWith(".svg"))  return "image/svg+xml";
  return "text/plain";
}

bool serveFile(String path) {
  if (!path.startsWith("/")) path = "/" + path;
  if (path.endsWith("/")) path += "index.html";
  String contentType = getContentType(path);
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  server.streamFile(f, contentType);
  f.close();
  return true;
}

void setup() {
  Serial.begin(115200);

  pinMode(BUTTON1, INPUT_PULLUP);
  pinMode(BUTTON2, INPUT_PULLUP);

  ledcAttach(LED1, 5000, 8);
  ledcAttach(LED2, 5000, 8);

  randomSeed(analogRead(POT));

  if (!LittleFS.begin(true)) {
    Serial.println("FS fail");
    return;
  }

  WiFi.softAP(AP_SSID, AP_PASS);
  delay(100);
  Serial.println(WiFi.softAPIP());

  server.on("/", HTTP_GET, []() {
    serveFile("/index.html");
  });

  server.onNotFound([]() {
    if (!serveFile(server.uri())) {
      server.send(404, "text/plain", "not found");
    }
  });

  server.begin();

  ws.begin();
  ws.onEvent(wsEvent);

  Serial.println("ready");
}

void wsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_DISCONNECTED) {
    wsClientConnected = false;
  } else if (type == WStype_CONNECTED) {
    wsClientConnected = true;
  } else if (type == WStype_TEXT) {
    String cmd = String((char*)payload);
    cmd.trim();
    handleCommand(cmd);
  }
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    handleCommand(cmd);
  }

  ws.loop();
  server.handleClient();

  int potValue = analogRead(POT);
  int pot2Value = analogRead(POT2);
  int brightness = map(potValue, 0, 4095, 20, 255);

  if (millis() - lastHeartbeat >= 150) {
    lastHeartbeat = millis();
    String msg1 = "POT:" + String(potValue);
    String msg2 = "POT2:" + String(pot2Value);
    Serial.println(msg1);
    Serial.println(msg2);
    if (wsClientConnected) {
      ws.broadcastTXT(msg1 + "\n");
      ws.broadcastTXT(msg2 + "\n");
    }
  }

  if (!gameMode) {
    if (millis() - lastFlicker >= 150) {
      lastFlicker = millis();

      int target1 = constrain(brightness + random(-10, 11), 0, 255);
      int target2 = constrain(brightness + random(-10, 11), 0, 255);

      flame1 += (target1 - flame1) * 0.10;
      flame2 += (target2 - flame2) * 0.10;

      ledcWrite(LED1, (int)flame1);
      ledcWrite(LED2, (int)flame2);
    }
  }

  static bool lastButton1 = HIGH;
  static bool lastButton2 = HIGH;

  bool button1 = digitalRead(BUTTON1);
  bool button2 = digitalRead(BUTTON2);

  if (lastButton1 == HIGH && button1 == LOW) {
    String msg = "BUTTON_1";
    Serial.println(msg);
    if (wsClientConnected) ws.broadcastTXT(msg + "\n");
  }

  if (lastButton2 == HIGH && button2 == LOW) {
    String msg = "BUTTON_2";
    Serial.println(msg);
    if (wsClientConnected) ws.broadcastTXT(msg + "\n");
  }

  lastButton1 = button1;
  lastButton2 = button2;
}

void handleCommand(String cmd) {
  if (cmd == "MODE:GAME") {
    gameMode = true;
    ledcWrite(LED1, 0);
    ledcWrite(LED2, 0);
  } else if (cmd == "MODE:CANDLE") {
    gameMode = false;
  } else if (cmd == "LED1:ON") {
    ledcWrite(LED1, 255);
  } else if (cmd == "LED1:OFF") {
    ledcWrite(LED1, 0);
  } else if (cmd == "LED2:ON") {
    ledcWrite(LED2, 255);
  } else if (cmd == "LED2:OFF") {
    ledcWrite(LED2, 0);
  } else if (cmd == "LED:BOTH:ON") {
    ledcWrite(LED1, 255);
    ledcWrite(LED2, 255);
  } else if (cmd == "LED:BOTH:OFF") {
    ledcWrite(LED1, 0);
    ledcWrite(LED2, 0);
  } else if (cmd.startsWith("LED1:VAL:")) {
    int val = cmd.substring(8).toInt();
    ledcWrite(LED1, constrain(val, 0, 255));
  } else if (cmd.startsWith("LED2:VAL:")) {
    int val = cmd.substring(8).toInt();
    ledcWrite(LED2, constrain(val, 0, 255));
  }
}