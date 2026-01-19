export enum ProcessType {
  NONE = 'All Done',
  FETCHING_SAVED_ALBUMS = 'Fetching Saved Albums',
  FETCHING_ALBUMS = 'Fetching Albums',
}

interface CurrentProcessProps {
  process: ProcessType;
}

export default function CurrentProcess({ process }: CurrentProcessProps) {
  return <div>Current Process: {process}</div>;
}
