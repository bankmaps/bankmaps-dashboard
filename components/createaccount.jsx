// components/CreateAccount.jsx

'use client';  // Required for interactive state in App Router

import { useState } from 'react';
import lendersData from '../data/hmda_list.json';     // from components/ → up one level to root data/
import geoData from '../data/geographies.json';

export default function CreateAccount() {
  console.log('Lenders count:', lendersData?.length || 'failed to load');
  console.log('Geography rows:', geoData?.length || 'failed to load');

  return (
    <div style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
      <h1>Create Account (Test)</h1>
      <p>Check browser console for data load counts.</p>
    </div>
  );
}
