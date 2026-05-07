import subprocess
from concurrent.futures import ThreadPoolExecutor

COMMAND = ["ping", "hellcore.net"]  

def run_cmd(i):
    print(f"Starting task {i}")
    result = subprocess.run(COMMAND, capture_output=True, text=True)
    print(f"Finished task {i}")
    print(result.stdout)

if __name__ == "__main__":
    num_threads = 100

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        for i in range(num_threads):
            executor.submit(run_cmd, i)