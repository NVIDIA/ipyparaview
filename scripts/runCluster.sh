#!/bin/bash

#Parse the requested number of workers from the command line
if [ $# -eq 0 ]; then
    #No workers specified; query the number of GPUs, and launch one worker/GPU
    N=`nvidia-smi --list-gpus | wc -l`
else
    N=$1
fi

mkdir -p dask-worker-space

CLEAN_CMD='rm -rf /tmp/scheduler.json *.lock dask-worker-space/*' #cleans up leftover lock files from last run
SCHED_CMD='mpiexec --allow-run-as-root -n 1 dask-mpi --scheduler-file /tmp/scheduler.json --no-nanny --local-directory dask-worker-space' #executes one scheduler process
WORK_CMD="mpiexec --allow-run-as-root -n $N dask-mpi --scheduler-file /tmp/scheduler.json --no-nanny --local-directory dask-worker-space --no-scheduler" #executes $N workers, connects them to scheduler

$CLEAN_CMD ; $SCHED_CMD & $WORK_CMD ; fg
