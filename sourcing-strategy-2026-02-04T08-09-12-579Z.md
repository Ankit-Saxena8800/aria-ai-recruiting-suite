# Candidate Sourcing Strategy

Here's a comprehensive candidate sourcing strategy for the Senior Backend Engineer role at STAGE:

---

### **1. Boolean Search Strings (for Naukri, Indeed, etc.)**

These strings are designed to capture the core requirements while allowing for variations in job titles and skill descriptions, and excluding irrelevant profiles.

**Variation 1 (Core Skills + Domain):**
```
(Python AND (Django OR Flask) AND REST AND API AND (PostgreSQL OR MongoDB) AND AWS AND Microservices AND ("Video Streaming" OR CDN OR OTT OR "Media & Entertainment")) AND ("Senior Backend" OR "Lead Backend" OR "Tech Lead" OR "Software Development Engineer 2" OR "Software Development Engineer 3") NOT (Intern OR Student OR Fresher OR Junior OR "SDE 1")
```
*   **Rationale:** Targets mandatory skills, includes domain keywords, and looks for senior-level titles while excluding entry-level.

**Variation 2 (Expanding Skills & Protocols):**
```
(Python AND (Django OR Flask) AND AWS AND Microservices AND (PostgreSQL OR MongoDB) AND ("Video Streaming" OR CDN OR HLS OR DASH OR "Video Encoding" OR "Video Transcoding")) AND ("Senior Developer" OR "Lead Developer" OR "Software Architect" OR "SSE") NOT (Intern OR Student OR Fresher OR "Trainee Engineer")
```
*   **Rationale:** Incorporates nice-to-have video protocols and encoding skills, uses slightly broader senior titles.

**Variation 3 (Focus on High Traffic & Scale):**
```
(Python AND (Django OR Flask) AND AWS AND Microservices AND (PostgreSQL OR MongoDB) AND ("High Traffic" OR "Scalable Systems" OR "Concurrent Users" OR "Performance Optimization") AND (OTT OR "Content Delivery")) AND ("Senior Engineer" OR "Lead Engineer" OR "Staff Engineer") NOT (Intern OR Student OR Fresher OR "Junior Engineer" OR "Support Engineer")
```
*   **Rationale:** Emphasizes the crucial experience with high-scale systems and performance, linking it directly to the OTT domain.

**Variation 4 (Including Specific Tools):**
```
(Python AND (Django OR Flask) AND AWS AND Microservices AND (PostgreSQL OR MongoDB) AND (Redis OR Celery OR Docker OR Kubernetes) AND ("Video Streaming" OR CDN OR OTT)) AND ("Senior Backend" OR "Tech Lead") NOT (Intern OR Student OR Fresher OR "Sales Engineer")
```
*   **Rationale:** Integrates nice-to-have tools for asynchronous processing and containerization, focusing on core senior backend roles.

---

### **2. LinkedIn X-Ray Search Strings (using Google)**

These strings leverage Google's X-ray search to directly scan LinkedIn profiles, helping to find passive candidates and filter by specific criteria like location and company types.

**Variation 1 (Core Skills + Domain + Location):**
```
site:linkedin.com/in/ OR site:linkedin.com/pub/ "Senior Backend Engineer" (Python AND (Django OR Flask) AND AWS AND Microservices AND (OTT OR "Video Streaming" OR CDN)) (Noida OR Delhi OR Gurgaon OR Bangalore OR Mumbai OR Remote)
```
*   **Rationale:** Direct approach combining key skills, domain, and primary locations (including remote).

**Variation 2 (Broader Titles + Experience Hint + Specific Video Tech):**
```
site:linkedin.com/in/ OR site:linkedin.com/pub/ (("Lead Backend" OR "Tech Lead" OR "Senior Software Developer") AND Python AND (Django OR Flask) AND AWS AND Microservices AND ("4-6 years experience" OR "5+ years experience") AND (HLS OR DASH OR "Video Encoding"))
```
*   **Rationale:** Targets senior/lead roles, explicitly includes experience range (which Google can sometimes parse from profiles), and focuses on advanced video technologies.

**Variation 3 (Targeting Competitor Companies/Domains):**
```
site:linkedin.com/in/ OR site:linkedin.com/pub/ (Python AND (Django OR Flask) AND AWS AND Microservices) ("Jio Cinema" OR "Hotstar" OR "Voot" OR "SonyLIV" OR "Zee5" OR "Netflix" OR "Amazon Prime Video" OR "MX Player") ("Senior Engineer" OR "Lead Developer")
```
*   **Rationale:** Excellent for finding candidates with direct industry experience by searching within known OTT/media companies.

**Variation 4 (Combination of Must-Haves & Nice-to-Haves for strong match):**
```
site:linkedin.com/in/ OR site:linkedin.com/pub/ (Python AND Django AND REST AND API AND AWS AND Microservices AND "Video Streaming" AND CDN AND (PostgreSQL OR MongoDB) AND (Docker OR Kubernetes OR Redis)) "Senior Backend"
```
*   **Rationale:** Creates a highly specific query to identify candidates with a comprehensive skill set matching both must-haves and several nice-to-haves.

---

### **3. Candidate Profile Criteria**

**Must-Have Skills:**
*   **Technical:**
    *   **Python (Expert):** Deep understanding of Python, including asynchronous programming.
    *   **Django/Flask (Proficient):** Experience building complex, scalable web applications.
    *   **RESTful API Design & Development:** Strong understanding of API best practices, versioning, security, and documentation.
    *   **Database Design:** Proficiency with PostgreSQL (preferred) and/or MongoDB, including schema design, indexing, and query optimization.
    *   **AWS Services:** Hands-on experience with EC2, S3, Lambda, RDS, and understanding of AWS ecosystem for deployment/scaling.
    *   **Video Streaming Protocols & CDN Integration:** Foundational knowledge of how video streaming works, and experience integrating with CDNs (e.g., CloudFront, Akamai).
    *   **Microservices Architecture:** Experience designing, implementing, and maintaining microservices, including inter-service communication patterns.
*   **Soft Skills:**
    *   **Problem-Solving:** Ability to architect solutions for high-traffic, low-latency, and high-availability systems.
    *   **Ownership & Autonomy:** Demonstrated ability to take initiatives and drive projects end-to-end.
    *   **Mentorship:** Readiness to guide and mentor junior engineers.
    *   **Agile Mindset:** Experience working in fast-paced Agile/Scrum environments.
    *   **Collaboration:** Strong communication skills for working with product, frontend, and other backend teams.

**Preferred Experience:**
*   **Years:** 4-6 years of dedicated, hands-on backend software development experience.
*   **Domains:** Direct experience in OTT, Media & Entertainment, Video Streaming platforms, or large-scale consumer-facing applications with significant video/content components.
*   **Company Types:** Product-led startups or fast-growing mid-sized companies dealing with high concurrency and significant user bases.

**Red Flags to Avoid:**
*   **Monolithic-only experience:** Limited or no exposure to microservices architecture for scaling.
*   **Lack of cloud experience:** No practical experience deploying and managing applications on AWS (or similar cloud providers).
*   **No exposure to high-scale challenges:** Candidates whose experience is primarily with low-traffic applications or internal tools.
*   **Solely Fullstack or DevOps:** While related, the role requires deep backend expertise. Limited depth in backend architecture or Python is a red flag.
*   **Very basic database skills:** Lacks understanding of database performance, scaling, or advanced queries.
*   **Lack of ownership/leadership examples:** No instances of leading features, projects, or mentoring.

**Nice-to-Have Qualifications:**
*   Experience with video encoding/transcoding pipelines.
*   In-depth knowledge of HLS/DASH protocols.
*   Experience with Redis and Celery for caching and asynchronous task processing.
*   Proficiency with Docker and Kubernetes for containerization and orchestration.
*   Contributions to open-source projects, especially in Python/Django/Flask or video tech.
*   Bachelor's or Master's degree in Computer Science or a related field.

---

### **4. Sourcing Strategy**

**Where to Find These Candidates:**

1.  **Job Boards & Professional Networks:**
    *   **LinkedIn Recruiter:** Primary tool for advanced search, InMail, and leveraging connections.
    *   **Naukri, Indeed, Monster:** For active job seekers in India.
    *   **Instahyre, CutShort, Hired:** Curated talent platforms that might have relevant profiles.
    *   **GitHub/Stack Overflow:** Identify active contributors to Python, Django, Flask, or video-related projects. Check their profiles for professional experience.
2.  **Developer Communities & Events:**
    *   **Python/Django/Flask Meetups:** Active communities in major Indian cities (Delhi-NCR, Bangalore, Mumbai, Pune). Even virtual events can be valuable.
    *   **AWS User Groups:** Connect with engineers deeply involved in cloud infrastructure.
    *   **OTT/Media Tech Conferences:** Attend or follow virtual events related to streaming technology.
    *   **Slack/Discord Channels:** Join relevant tech communities focused on Python, backend engineering, or microservices.
3.  **Referrals:**
    *   **Internal Employee Referrals:** Leverage the existing team's network, offering attractive referral bonuses.
    *   **Network Referrals:** Tap into your own professional network and ask for recommendations.
4.  **Targeted Outreach:**
    *   **Company Career Pages:** Monitor "Join Us" sections of competitor/similar companies.
    *   **University Alumni Networks:** Target alumni with 4-6 years of experience from top-tier engineering colleges.

**Outreach Message Angle (What Would Attract Them?):**

*   **Impact & Scale:** "Join a rapidly scaling OTT platform with millions of concurrent users. Your code will directly impact user experience and shape the future of our product."
*   **Technical Challenge:** "Solve complex backend challenges in video streaming, optimize for high traffic, and work with microservices architecture on AWS. We're looking for engineers who thrive on tackling hard problems."
*   **Ownership & Autonomy:** "At STAGE, you'll have significant ownership and autonomy over your work, contributing directly to key features and leading technical initiatives in a fast-paced startup environment."
*   **Domain Excitement:** "If you're passionate about media, entertainment, and building innovative video experiences, this is your chance to make a mark in the OTT space."
*   **Growth & Mentorship:** "Grow your career by mentoring junior engineers and taking on leadership roles within a dynamic team focused on continuous learning."
*   **Personalization:** Always customize the message. Mention something specific from their profile (a project, a skill, a past company) that caught your eye and aligns with STAGE's requirements.

**Competitive Intelligence (What Companies to Target?):**

1.  **Direct OTT/Video Streaming Platforms (India-focused):**
    *   Disney+ Hotstar, Jio Cinema, Voot, SonyLIV, Zee5, MX Player, Aha, ETV Win, Sun NXT.
    *   Amazon Prime Video (India teams), Netflix (teams with relevant backend work).
2.  **Large-Scale Consumer Tech Companies with Video/Media Components:**
    *   Swiggy, Zomato, Ola (companies dealing with high concurrency, complex backend systems).
    *   Flipkart, Myntra, Amazon (e-commerce with scale, often feature video for ads/content).
    *   Byju's, Unacademy, Vedantu (EdTech platforms with significant video streaming infrastructure).
3.  **Companies with Strong Python/Django/AWS/Microservices Culture:**
    *   Any product-first tech company in India known for building scalable backend systems using modern technologies.
4.  **Media & Broadcasting Tech Providers:**
    *   Companies that build backend solutions, content management systems, or ad-tech platforms for media houses.
5.  **Startups with Similar Tech Stacks:**
    *   Look for other fast-growing startups in India that prioritize Python, AWS, and microservices architecture.