#!/bin/bash

#===============================================================================
# Aria AI Security Test Script
#===============================================================================
# Tests all implemented security features
# Usage: bash test-security.sh
#===============================================================================

BASE_URL="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================"
echo "  🔐 Aria AI Security Test Suite"
echo "============================================================"
echo ""

# Test counter
PASSED=0
FAILED=0
TOTAL=0

# Helper function
test_endpoint() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"

  TOTAL=$((TOTAL + 1))

  if [[ "$actual" == *"$expected"* ]]; then
    echo -e "${GREEN}✓${NC} $test_name"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $test_name"
    echo "   Expected: $expected"
    echo "   Got: $actual"
    FAILED=$((FAILED + 1))
  fi
}

#===============================================================================
# Test 1: Health Check Endpoints
#===============================================================================
echo "Testing Health Check Endpoints..."

HEALTH=$(curl -s "$BASE_URL/health")
test_endpoint "Health endpoint returns status ok" '"status":"ok"' "$HEALTH"

READY=$(curl -s "$BASE_URL/ready")
test_endpoint "Readiness endpoint returns ready" '"status":"ready"' "$READY"

echo ""

#===============================================================================
# Test 2: Security Headers (Helmet.js)
#===============================================================================
echo "Testing Security Headers..."

HEADERS=$(curl -sI "$BASE_URL/login.html")

test_endpoint "X-Content-Type-Options header present" "x-content-type-options: nosniff" "$HEADERS"
test_endpoint "X-Frame-Options header present" "x-frame-options:" "$HEADERS"

echo ""

#===============================================================================
# Test 3: Rate Limiting
#===============================================================================
echo "Testing Rate Limiting..."

# Test login rate limiting (should allow first request)
RESPONSE1=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}')

test_endpoint "First login attempt allowed" "success" "$RESPONSE1"

# Make 5 more rapid requests to trigger rate limit
for i in {1..5}; do
  curl -s -X POST "$BASE_URL/api/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}' > /dev/null
done

# 6th request should be rate limited
RESPONSE_LIMITED=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}')

test_endpoint "Rate limiting triggers after 5 attempts" "Too many" "$RESPONSE_LIMITED"

echo ""

#===============================================================================
# Test 4: Input Validation
#===============================================================================
echo "Testing Input Validation..."

# Test invalid email
INVALID_EMAIL=$(curl -s -X POST "$BASE_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName":"Test",
    "lastName":"User",
    "email":"invalid-email",
    "username":"testuser123",
    "password":"Password123",
    "department":"Engineering"
  }')

test_endpoint "Invalid email rejected" "Invalid email" "$INVALID_EMAIL"

# Test weak password
WEAK_PASSWORD=$(curl -s -X POST "$BASE_URL/api/register" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName":"Test",
    "lastName":"User",
    "email":"test@example.com",
    "username":"testuser123",
    "password":"weak",
    "department":"Engineering"
  }')

test_endpoint "Weak password rejected" "at least 8 characters" "$WEAK_PASSWORD"

echo ""

#===============================================================================
# Test 5: JWT Authentication
#===============================================================================
echo "Testing JWT Authentication..."

# Try to access protected endpoint without token
NO_TOKEN=$(curl -s "$BASE_URL/api/profile")
test_endpoint "Protected endpoint requires token" "Unauthorized" "$NO_TOKEN"

# Try with invalid token
INVALID_TOKEN=$(curl -s "$BASE_URL/api/profile" \
  -H "Authorization: Bearer invalid_token_123")
test_endpoint "Invalid token rejected" "Unauthorized" "$INVALID_TOKEN"

echo ""

#===============================================================================
# Test 6: Admin Authorization
#===============================================================================
echo "Testing Admin Authorization..."

# Try to access admin endpoint without admin role
NO_ADMIN=$(curl -s "$BASE_URL/api/admin/users")
test_endpoint "Admin endpoint requires authentication" "Unauthorized" "$NO_ADMIN"

# Try with non-admin token (would need valid user token to test fully)
RESPONSE=$(curl -s "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer fake_user_token")
test_endpoint "Admin endpoint requires admin role" "Unauthorized" "$RESPONSE"

echo ""

#===============================================================================
# Test 7: Password Security (Hashing)
#===============================================================================
echo "Testing Password Security..."

# Check that passwords in users.json are hashed
if [ -f "users.json" ]; then
  PASSWORD_CHECK=$(grep -o '\$2b\$' users.json | head -1)
  if [ ! -z "$PASSWORD_CHECK" ]; then
    echo -e "${GREEN}✓${NC} Passwords are hashed with bcrypt"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo -e "${RED}✗${NC} Passwords are NOT hashed"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
  fi
else
  echo -e "${YELLOW}⚠${NC} users.json not found, skipping password hash check"
fi

echo ""

#===============================================================================
# Test 8: Environment Configuration
#===============================================================================
echo "Testing Environment Configuration..."

if [ -f ".env" ]; then
  # Check if JWT_SECRET is set
  JWT_CHECK=$(grep "JWT_SECRET" .env)
  if [ ! -z "$JWT_CHECK" ]; then
    echo -e "${GREEN}✓${NC} JWT_SECRET is configured"
    PASSED=$((PASSED + 1))
    TOTAL=$((TOTAL + 1))
  else
    echo -e "${RED}✗${NC} JWT_SECRET is NOT configured"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # Check if .env is in .gitignore
  if [ -f ".gitignore" ]; then
    GITIGNORE_CHECK=$(grep ".env" .gitignore)
    if [ ! -z "$GITIGNORE_CHECK" ]; then
      echo -e "${GREEN}✓${NC} .env is in .gitignore"
      PASSED=$((PASSED + 1))
      TOTAL=$((TOTAL + 1))
    else
      echo -e "${RED}✗${NC} .env is NOT in .gitignore"
      FAILED=$((FAILED + 1))
      TOTAL=$((TOTAL + 1))
    fi
  fi
else
  echo -e "${YELLOW}⚠${NC} .env file not found"
fi

echo ""

#===============================================================================
# Summary
#===============================================================================
echo "============================================================"
echo "  Test Results"
echo "============================================================"
echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
else
  echo -e "Failed: $FAILED"
fi

PERCENTAGE=$((PASSED * 100 / TOTAL))
echo -e "Success Rate: $PERCENTAGE%"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All security tests passed!${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some security tests failed. Please review.${NC}"
  echo ""
  exit 1
fi
