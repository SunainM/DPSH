


# 🏠 Dynamic Personalized Smart Home (DPSH)

A distributed, IoT-based smart home system designed to simulate adaptive environments using MQTT, Node-RED, and MongoDB Atlas — deployed across AWS EC2 instances for scalability and fault tolerance.

---

## 🌐 Overview

**DPSH (Dynamic Personalized Smart Home)** integrates multiple simulated IoT sensors, cloud-based data processing, and real-time dashboards to create a personalized, scalable smart home environment.

Each simulated room (e.g., hallway, living room, bedrooms) streams sensor data such as temperature, light, motion, and facial recognition to an **EMQX MQTT broker** hosted on AWS.  
A controller service processes face detections, performs mood inference, and retrieves personalized environment settings from **MongoDB Atlas**.  
The **Node-RED** interface orchestrates data flow, applies decision logic, and visualizes real-time metrics through an interactive dashboard.

---

## 🧩 System Architecture

The system is composed of the following main components:

| Component | Description |
|------------|-------------|
| **Sensor Simulators** | Node.js scripts publishing temperature, light, motion, and face data for each room. |
| **MQTT Broker (EMQX)** | Dockerized MQTT broker hosted on AWS EC2, load-balanced via AWS NLB. |
| **Controller EC2** | Runs `faceMLSim.js` and `MoodAggregator` to process user moods and environment logic. |
| **MongoDB Atlas** | Stores user identity, mood preferences, and environmental settings. |
| **Node-RED EC2** | Subscribes to MQTT topics, applies logic flows, and drives dashboard visualization. |
| **PM2 Process Manager** | Ensures fault-tolerant Node.js process management and automatic restarts. |

---

## ⚙️ Features

- 🌡️ **Real-Time Sensor Simulation** – Multi-room environmental data streams.
- 💡 **Adaptive Environment Control** – Lights and temperature adjust automatically based on mood.
- 🧠 **Face-Based Personalization** – Facial recognition simulates mood-based preferences.
- ☁️ **AWS Cloud Deployment** – EMQX, Node-RED, and controllers deployed on EC2 behind a Network Load Balancer.
- 📊 **Node-RED Dashboard** – Interactive visualization for rooms, users, and system state.
- 🧩 **Scalable Modular Design** – Add rooms or devices by editing configuration JSON files.

---

## 🏗️ Project Structure

```

ProjectSmartHome/
│
├── src/
│   ├── sensors/
│   │   ├── sims/
│   │   │   ├── temp.sim.js
│   │   │   ├── motion.sim.js
│   │   │   ├── light.sim.js
│   │   │   ├── facecam.sim.js
│   │   ├── bed1.json
│   │   ├── bed2.json
│   │   ├── hallway.json
│   │   └── living.json
│   │
│   ├── controllers/
│   │   ├── faceMLSim.js
│   │   ├── moodAggregator.js
│   │   └── utils/
│   │
│   └── .env
│
├── docker-compose.yml
├── package.json
├── README.md
└── docs/
├── Report.pdf
└── images/

````

---

## 🚀 Deployment Steps

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/DynamicPersonalizedSmartHome.git
cd DynamicPersonalizedSmartHome
````

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file with:

```bash
BROKER_URL=mqtt://<NLB-DNS>:1883
MONGO_URL=mongodb+srv://<user>:<pass>@cluster.mongodb.net/smarthome
DB_NAME=smarthome
FACE_COLL=faces
MOOD_COLL=moods
```

### 4. Run sensor simulators

```bash
pm2 start src/sensors/simRunner.js --name sensors
```

### 5. Start controller services

```bash
pm2 start src/controllers/faceMLSim.js --name faceML
pm2 start src/controllers/moodAggregator.js --name moodAgg
```

### 6. Launch Node-RED

```bash
node-red
```

Access the dashboard at:

```
http://<NodeRED-EC2-PublicDNS>:1880/ui
```

---

## 📡 MQTT Topics

| Topic                   | Description                   |
| ----------------------- | ----------------------------- |
| `homeA/<room>/temp`     | Temperature readings          |
| `homeA/<room>/motion`   | Motion detection              |
| `homeA/<room>/light`    | Light status                  |
| `homeA/<room>/faceData` | Simulated face detection      |
| `homeA/<room>/mood/out` | Aggregated mood output        |
| `homeA/<room>/cmd`      | Control commands to actuators |

---

## 🧰 Technologies Used

| Layer                         | Tools            |
| ----------------------------- | ---------------- |
| **Simulation & Logic**        | Node.js, MQTT.js |
| **Messaging & Communication** | EMQX MQTT Broker |
| **Database**                  | MongoDB Atlas    |
| **Cloud Infrastructure**      | AWS EC2, AWS NLB |
| **Visualization**             | Node-RED         |
| **Process Management**        | PM2              |

---

## 🧪 Testing & Validation

| Test Case          | Description                  | Result |
| ------------------ | ---------------------------- | ------ |
| Motion + Low Light | Light turns on automatically | ✅ Pass |
| Idle > 30s         | Auto light off               | ✅ Pass |
| Face Detection     | Triggers mood lookup         | ✅ Pass |
| Multi-user Mood    | Aggregation works            | ✅ Pass |
| MQTT Latency       | Under 2 seconds              | ✅ Pass |

---

## 📈 Scalability and Future Work

* Integrate real facial recognition models (e.g., OpenCV + TensorFlow Lite).
* Expand to real IoT devices using ESP32 / Raspberry Pi nodes.
* Add a central web dashboard for remote monitoring.
* Migrate to containerized microservices using AWS ECS or Kubernetes.

---

## 👤 Author

**Sunain Mushtaq**
📚 Computer Science Student – Deakin University
📧 [[your.email@example.com](mailto:your.email@example.com)]
🔗 [LinkedIn](https://linkedin.com/in/your-profile)

---

## 📝 License

This project is licensed under the **MIT License** – feel free to modify and build upon it for educational or research purposes.


