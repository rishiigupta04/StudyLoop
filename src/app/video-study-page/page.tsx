import React from 'react';
import AppLayout from '@/components/AppLayout';
import VideoStudyLayout from './components/VideoStudyLayout';

export default function VideoStudyPage() {
  return (
    <AppLayout activeRoute="/video-study-page">
      <VideoStudyLayout />
    </AppLayout>
  );
}