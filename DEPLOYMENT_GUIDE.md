# Aria AI Recruiting Suite - Production Deployment Guide

**Last Updated:** February 5, 2026
**Version:** 1.0.0-production-ready

---

## 🎉 Security Improvements Implemented

All **CRITICAL (P0)** security issues have been resolved:

### ✅ Completed Security Fixes

1. **JWT Token Authentication**
   - ✅ Proper JWT tokens with expiration
   - ✅ Token verification middleware
   - ✅ Role-based access control
   - ✅ Secure token signing with secret

2. **Password Security**
   - ✅ Bcrypt password hashing (salt rounds: 10)
   - ✅ Migration script for existing passwords
   - ✅ Strong password validation (min 8 chars, uppercase, lowercase, number)

3. **Rate Limiting**
   - ✅ Login attempts: 5 per 15 minutes
   - ✅ Registration: 3 per hour per IP
   - ✅ API endpoints: 100 per 15 minutes

4. **Security Headers**
   - ✅ Helmet.js for security headers
   - ✅ Content Security Policy
   - ✅ XSS Protection
   - ✅ MIME sniffing prevention

5. **Input Validation**
   - ✅ Express-validator for all forms
   - ✅ Email normalization
   - ✅ Alphanumeric username validation
   - ✅ XSS prevention

6. **Admin Authorization**
   - ✅ JWT-based admin verification
   - ✅ Protected admin endpoints
   - ✅ Audit logging for admin actions

7. **Health Monitoring**
   - ✅ /health endpoint for liveness checks
   - ✅ /ready endpoint for readiness checks
   - ✅ /api/status for system metrics (admin only)

---

## 📋 Pre-Deployment Checklist

### 1. Environment Configuration

Update your `.env` file for production:

```env
# Server
NODE_ENV=production
PORT=3000
DASHBOARD_PORT=3001

# Security - CRITICAL: Generate new secrets!
JWT_SECRET=<GENERATE_STRONG_SECRET_HERE>
JWT_EXPIRES_IN=24h

# Claude API
ANTHROPIC_API_KEY=<your-production-api-key>

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=hr@yourdomain.com
EMAIL_PASSWORD=<your-app-password>
EMAIL_FROM=Aria AI <hr@yourdomain.com>
ADMIN_EMAIL=admin@yourdomain.com

# URLs
APP_URL=https://yourdomain.com
```

**Generate strong JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Install Dependencies

```bash
npm install
```

All security packages are now included:
- ✅ bcrypt
- ✅ jsonwebtoken
- ✅ express-rate-limit
- ✅ helmet
- ✅ express-validator

### 3. Migrate Existing Passwords

If you have existing users, run the migration script:

```bash
node migrate-passwords.js
```

This will:
- Create a backup of users.json
- Hash all plain-text passwords with bcrypt
- Skip SSO users (they don't have passwords)
- Safe to run multiple times

### 4. Test Locally

Start the server and test all functionality:

```bash
npm start
```

Test checklist:
- [ ] Login with existing admin account
- [ ] Register new user
- [ ] Approve/reject users (admin)
- [ ] Update profile
- [ ] Change password
- [ ] Use AI recruiting tools
- [ ] Test bulk operations
- [ ] Check audit logs
- [ ] Verify rate limiting works

### 5. Setup SSL/HTTPS

**Option A: Reverse Proxy (Recommended)**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Option B: Platform with Built-in SSL**
- Heroku (automatic SSL)
- Vercel (automatic SSL)
- AWS Elastic Beanstalk + ACM
- Google Cloud Run + Load Balancer

**Option C: Let's Encrypt**
```bash
sudo certbot --nginx -d yourdomain.com
```

### 6. Database Backup Strategy

**Setup automated backups:**

```bash
#!/bin/bash
# save as: backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/path/to/backups"

# Create backup
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" users.json audit-logs.json .env

# Upload to S3 (optional)
aws s3 cp "$BACKUP_DIR/backup_$DATE.tar.gz" s3://your-bucket/backups/

# Keep only last 30 days
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.tar.gz"
```

Add to crontab for hourly backups:
```bash
0 * * * * /path/to/backup.sh
```

---

## 🚀 Deployment Steps

### Option 1: Traditional VPS/Server

1. **Clone repository:**
   ```bash
   git clone <your-repo-url>
   cd slack-aria-hr-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install --production
   ```

3. **Setup environment:**
   ```bash
   cp .env.example .env
   nano .env  # Update with production values
   ```

4. **Migrate passwords:**
   ```bash
   node migrate-passwords.js
   ```

5. **Use PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start dashboard-server.js --name aria-dashboard
   pm2 startup  # Enable auto-start on reboot
   pm2 save
   ```

6. **Setup nginx reverse proxy with SSL**

7. **Monitor logs:**
   ```bash
   pm2 logs aria-dashboard
   ```

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "dashboard-server.js"]
```

```bash
# Build and run
docker build -t aria-dashboard .
docker run -p 3001:3001 --env-file .env aria-dashboard
```

### Option 3: Heroku

```bash
# Install Heroku CLI
heroku login
heroku create aria-recruiting-suite

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=<your-secret>
heroku config:set ANTHROPIC_API_KEY=<your-key>
# ... set all other env vars

# Deploy
git push heroku main
```

### Option 4: AWS Elastic Beanstalk

```bash
eb init -p node.js aria-dashboard
eb create production-env
eb deploy
```

---

## 🔍 Post-Deployment Verification

### 1. Health Checks

```bash
# Liveness check
curl https://yourdomain.com/health

# Readiness check
curl https://yourdomain.com/ready

# System status (requires admin token)
curl -H "Authorization: Bearer <admin-token>" \
     https://yourdomain.com/api/status
```

### 2. Security Verification

Test these scenarios:
- [ ] Cannot login without rate limiting after 5 attempts
- [ ] Cannot register more than 3 times per hour
- [ ] Admin endpoints return 403 for non-admin users
- [ ] Expired JWT tokens are rejected
- [ ] Invalid tokens return 401
- [ ] Passwords are hashed in users.json
- [ ] SSL certificate is valid
- [ ] Security headers are present

### 3. Functionality Testing

- [ ] User registration works
- [ ] Email notifications are sent
- [ ] Admin can approve/reject users
- [ ] Profile updates work
- [ ] Password changes work
- [ ] All 12 AI tools function correctly
- [ ] Bulk operations work
- [ ] Audit logs are recorded

---

## 📊 Monitoring Setup

### 1. Application Monitoring

**Option A: PM2 Monitor**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

**Option B: Error Tracking (Sentry)**
```bash
npm install @sentry/node
```

```javascript
// Add to dashboard-server.js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });

app.use(Sentry.Handlers.errorHandler());
```

### 2. Uptime Monitoring

Use services like:
- UptimeRobot (free tier available)
- Pingdom
- StatusCake
- AWS CloudWatch

Configure alerts for:
- /health endpoint down
- /ready endpoint not ready
- Response time > 2 seconds
- Error rate > 1%

### 3. Log Management

**Option A: CloudWatch Logs (AWS)**
```bash
npm install winston winston-cloudwatch
```

**Option B: Papertrail**
- Easy setup
- Real-time log tailing
- Search and filtering

---

## 🔐 Security Best Practices

### 1. Keep Secrets Secure

- ✅ Never commit .env to git
- ✅ Use environment variables for all secrets
- ✅ Rotate JWT_SECRET every 90 days
- ✅ Use different secrets for dev/staging/production
- ✅ Store backups encrypted

### 2. Regular Updates

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update
npm audit fix
```

### 3. Access Control

- Limit SSH access to production servers
- Use SSH keys, not passwords
- Enable firewall (ufw/iptables)
- Whitelist IP addresses for admin access (optional)

### 4. Database Security

- Regular automated backups
- Test restore procedure monthly
- Keep backups offsite (S3, etc.)
- Monitor file sizes for corruption

---

## 🚨 Rollback Procedure

If something goes wrong:

### 1. Restore from Backup

```bash
# Stop the server
pm2 stop aria-dashboard

# Restore users.json
cp /path/to/backup/users.json ./users.json

# Restore audit logs
cp /path/to/backup/audit-logs.json ./audit-logs.json

# Restart server
pm2 restart aria-dashboard
```

### 2. Revert Code

```bash
git revert HEAD
pm2 restart aria-dashboard
```

### 3. Emergency Contact

Have these ready:
- Admin phone numbers
- Escalation contacts
- Cloud platform support contacts

---

## 📝 Ongoing Maintenance

### Daily
- Monitor error logs
- Check uptime alerts
- Verify backup completion

### Weekly
- Review audit logs for suspicious activity
- Check system metrics (memory, CPU, disk)
- Test critical user flows

### Monthly
- Review and update dependencies
- Test backup restore procedure
- Security audit
- Performance optimization review

### Quarterly
- Rotate JWT secret
- Update SSL certificates if needed
- Capacity planning review
- Disaster recovery drill

---

## 🆘 Troubleshooting

### Issue: Users can't login

**Check:**
1. Password migration completed? `node migrate-passwords.js`
2. JWT_SECRET set in .env?
3. Correct password format? (uppercase, lowercase, number, 8+ chars)
4. Check audit logs: `grep LOGIN_FAILED audit-logs.json`

### Issue: Rate limiting too strict

**Solution:** Adjust in dashboard-server.js:
```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10  // Increase from 5 to 10
});
```

### Issue: Admin can't access admin panel

**Check:**
1. JWT token contains role: 'admin'
2. Token not expired
3. Admin exists in users.json admins array

### Issue: Emails not sending

**Check:**
1. SMTP credentials correct
2. App password configured (not regular password)
3. Check logs: `pm2 logs | grep "Email"`
4. Test SMTP: `node -e "require('./dashboard-server.js')"`

---

## 📞 Support

For deployment assistance:
- **Email:** ankit.saxena@stage.in
- **Documentation:** See README.md, PRODUCTION_NOTES.md, BUG_AUDIT.md
- **Issues:** Create GitHub issue with [PRODUCTION] tag

---

## ✅ Production Readiness Status

| Category | Status | Notes |
|----------|--------|-------|
| Authentication | ✅ Ready | JWT + bcrypt implemented |
| Authorization | ✅ Ready | Role-based access control |
| Rate Limiting | ✅ Ready | Login, registration, API |
| Input Validation | ✅ Ready | All forms validated |
| Security Headers | ✅ Ready | Helmet.js configured |
| Password Security | ✅ Ready | Bcrypt with salt rounds 10 |
| Audit Logging | ✅ Ready | All actions logged |
| Email Notifications | ✅ Ready | SMTP configured |
| Health Checks | ✅ Ready | /health, /ready, /api/status |
| Error Handling | ✅ Ready | Graceful error responses |
| SSL/HTTPS | ⚠️ Required | Must configure before production |
| Database | ⚠️ Recommended | Consider PostgreSQL/MongoDB |
| Monitoring | ⚠️ Recommended | Setup Sentry or similar |

**Overall Status:** 🟢 **PRODUCTION READY** (with SSL)

---

**Last Review:** February 5, 2026
**Next Review:** March 5, 2026
