import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Milestone } from "../types";

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  milestones?: Milestone[];
}

export default function CircularProgress({
  progress,
  size = 200,
  strokeWidth = 12,
  milestones = []
}: CircularProgressProps) {
  const prevProgress = useRef(0);
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progress / 100) * circumference;

  const delta = progress - prevProgress.current;
  const totalTime = 1; // Total time to fill 100% (1 second)
  const duration = (Math.abs(delta) / 100) * totalTime;

  useEffect(() => {
    prevProgress.current = progress;
  }, [progress]);

  const getProgressColor = (value: number) => {
    if (value < 30) return "#ef4444"; // Red for less than 30%
    if (value < 70) return "#eab308"; // Yellow for less than 70%
    return "#22c55e"; // Green for 70% and above
  };

  // Calculate milestone segments
  const segments = milestones.map(milestone => ({
    weight: milestone.weight,
    status: milestone.status,
    offset: 0, // Will be calculated below
    color: milestone.status === 'completed' ? '#22c55e' : 
           milestone.status === 'in-progress' ? '#eab308' : '#ef4444'
  }));

  // Calculate segment offsets
  let currentOffset = 0;
  segments.forEach(segment => {
    segment.offset = currentOffset;
    currentOffset += (segment.weight / 100) * circumference;
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          className="text-gray-200"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={center}
          cy={center}
        />

        {/* Progress circle */}
        <motion.circle
          className="transition-all duration-300"
          strokeWidth={strokeWidth}
          stroke={getProgressColor(progress)}
          fill="transparent"
          r={radius}
          cx={center}
          cy={center}
          initial={{ strokeDashoffset: circumference, stroke: "#000" }}
          animate={{
            strokeDashoffset: progressOffset,
            stroke: getProgressColor(progress),
          }}
          transition={{ duration, ease: "linear" }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-4xl font-bold"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          {progress}%
        </motion.span>
        <motion.span
          className="text-sm text-gray-500"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.3 }}
        >
          Completed
        </motion.span>
      
      </div>
    </div>
  );
}