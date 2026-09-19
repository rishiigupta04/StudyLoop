import React from 'react';
import type { UiLang } from '@/lib/uiLang';
import StudyTimeChartInner from './StudyTimeChartInner';

export default function StudyTimeChart(props: { days: { date: string; minutes: number }[]; lang: UiLang }) {
  return <StudyTimeChartInner {...props} />;
}
