#!/usr/bin/env node

/**
 * Smoke Test Script for Patient Prompt Generator
 * This script tests:
 * 1. Authentication - Verifies login works and returns a valid user
 * 2. Report Generation - Tests that the monthly report PDF generator works
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Configuration - Update these values for your environment
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_USERNAME = process.env.TEST_USERNAME || 'testuser';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

// State variables
let authCookie = null;

async function runTests() {
  console.log('🔍 Running smoke tests on', BASE_URL);
  
  try {
    // Test 1: Authentication
    console.log('\n📋 TEST 1: Authentication');
    const loginSuccess = await testLogin();
    
    if (!loginSuccess) {
      console.error('❌ Authentication test failed. Stopping further tests.');
      process.exit(1);
    }
    
    // Test 2: Monthly Report Generation
    console.log('\n📋 TEST 2: Monthly Report Generation');
    await testMonthlyReport();
    
    console.log('\n✅ All smoke tests passed!');
  } catch (error) {
    console.error('\n❌ Smoke tests failed with error:', error);
    process.exit(1);
  }
}

async function testLogin() {
  console.log('Attempting to log in with test credentials...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
      }),
    });
    
    if (response.headers.get('set-cookie')) {
      authCookie = response.headers.get('set-cookie');
    }
    
    const data = await response.json();
    
    if (data.success && data.user) {
      console.log('✅ Login successful');
      console.log(`   Logged in as: ${data.user.username}`);
      return true;
    } else {
      console.error('❌ Login failed');
      console.error(`   Error: ${data.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Login request failed');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function testMonthlyReport() {
  if (!authCookie) {
    console.error('❌ Cannot test report generation - not authenticated');
    return false;
  }
  
  console.log('Generating a monthly report...');
  
  try {
    // Get current month and year for report
    const date = new Date();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    const response = await fetch(`${BASE_URL}/api/monthly-report?month=${month}&year=${year}`, {
      method: 'GET',
      headers: {
        'Cookie': authCookie,
      },
    });
    
    const data = await response.json();
    
    if (data.success && data.url) {
      console.log('✅ Report generation successful');
      console.log(`   Report URL: ${data.url}`);
      
      // Try downloading the PDF to verify it exists
      const pdfResponse = await fetch(`${BASE_URL}${data.url}`, {
        headers: {
          'Cookie': authCookie,
        },
      });
      
      if (pdfResponse.ok) {
        console.log('✅ PDF download successful');
        return true;
      } else {
        console.error('❌ PDF download failed with status:', pdfResponse.status);
        return false;
      }
    } else {
      console.error('❌ Report generation failed');
      console.error(`   Error: ${data.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Report generation request failed');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Run the tests
runTests(); 