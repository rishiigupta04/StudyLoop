'use client';
import React from 'react';
import dynamic from 'next/dynamic';

const StudyTimeChartInner = dynamic(() => import('./StudyTimeChartInner'), { ssr: false });

export default function StudyTimeChart() {
  return <StudyTimeChartInner />;
}