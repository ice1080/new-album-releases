import React from 'react';

interface ApiCountProps {
  apiCount: number;
}

export default function ApiCount({ apiCount }: ApiCountProps) {
  return <h2>API Count - {apiCount}</h2>;
}
