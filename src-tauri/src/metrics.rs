use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Disks, System};

pub const HISTORY_MS: u64 = 120_000;
const DISK_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub timestamp: u64,
    pub usage: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
    pub system: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub timestamp: u64,
    pub cpu_usage: f32,
    pub cpu_brand: String,
    pub cores: Vec<f32>,
    pub physical_cores: Option<usize>,
    pub memory_total: u64,
    pub memory_used: u64,
    pub swap_total: u64,
    pub swap_used: u64,
    pub disks: Vec<DiskInfo>,
    pub history: Vec<Sample>,
    pub uptime: u64,
    pub os: String,
    pub host: String,
}

pub struct Collector {
    system: System,
    disks: Disks,
    disk_info: Vec<DiskInfo>,
    history: VecDeque<Sample>,
    last_disk_refresh: Option<Instant>,
    cpu_brand: String,
    physical_cores: Option<usize>,
    os: String,
    host: String,
}

pub fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn finite_usage(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 100.0)
    } else {
        0.0
    }
}

fn push_history(history: &mut VecDeque<Sample>, sample: Sample) {
    // Wall-clock changes should not draw history backwards or bridge sleep gaps.
    if history.back().is_some_and(|last| {
        sample.timestamp < last.timestamp || sample.timestamp - last.timestamp > 15_000
    }) {
        history.clear();
    }
    let cutoff = sample.timestamp.saturating_sub(HISTORY_MS);
    while history.front().is_some_and(|p| p.timestamp < cutoff) || history.len() >= 121 {
        history.pop_front();
    }
    history.push_back(sample);
}

pub fn normalize_disks(disks: Vec<DiskInfo>, macos: bool) -> Vec<DiskInfo> {
    let has_data_volume = disks
        .iter()
        .any(|d| d.mount == "/System/Volumes/Data" && d.total > 0);
    let mut mounts = HashSet::new();
    let mut result: Vec<_> = disks
        .into_iter()
        .filter_map(|mut disk| {
            if disk.total == 0 {
                return None;
            }
            if macos {
                if disk.mount == "/System/Volumes/Data" {
                    disk.mount = "/".into();
                    disk.system = true;
                    disk.name = disk
                        .name
                        .strip_suffix(" - Data")
                        .unwrap_or(&disk.name)
                        .to_string();
                } else if disk.mount == "/" {
                    if has_data_volume {
                        return None;
                    }
                    disk.system = true;
                } else if !disk.mount.starts_with("/Volumes/") {
                    return None;
                }
            }
            disk.available = disk.available.min(disk.total);
            if mounts.insert(disk.mount.clone()) {
                Some(disk)
            } else {
                None
            }
        })
        .collect();
    result.sort_by(|a, b| b.system.cmp(&a.system).then(a.mount.cmp(&b.mount)));
    result
}

impl Collector {
    pub fn new() -> Self {
        let mut system = System::new();
        // Prime CPU counters. Call sample only after the minimum sampling interval.
        system.refresh_cpu_usage();
        let cpu_brand = system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().trim().to_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "处理器".into());
        Self {
            system,
            disks: Disks::new(),
            disk_info: Vec::new(),
            history: VecDeque::with_capacity(121),
            last_disk_refresh: None,
            cpu_brand,
            physical_cores: System::physical_core_count(),
            os: format!(
                "{} {}",
                if cfg!(target_os = "macos") {
                    "macOS".into()
                } else {
                    System::name().unwrap_or_else(|| std::env::consts::OS.into())
                },
                System::os_version().unwrap_or_default()
            )
            .trim()
            .into(),
            host: System::host_name().unwrap_or_else(|| "我的电脑".into()),
        }
    }

    pub fn sample(&mut self) -> Result<Snapshot, String> {
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        if self.system.cpus().is_empty() || self.system.total_memory() == 0 {
            return Err("无法读取 CPU 或内存信息，正在重试。".into());
        }
        if self
            .last_disk_refresh
            .is_none_or(|last| last.elapsed() >= DISK_INTERVAL)
        {
            self.disks.refresh(true);
            let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
            self.disk_info = normalize_disks(
                self.disks
                    .list()
                    .iter()
                    .map(|disk| {
                        let mount = disk.mount_point().to_string_lossy().into_owned();
                        let system = if cfg!(target_os = "windows") {
                            mount
                                .trim_end_matches(['\\', '/'])
                                .eq_ignore_ascii_case(&system_drive)
                        } else {
                            mount == "/"
                        };
                        DiskInfo {
                            name: disk.name().to_string_lossy().into_owned(),
                            mount,
                            total: disk.total_space(),
                            available: disk.available_space(),
                            removable: disk.is_removable(),
                            system,
                        }
                    })
                    .collect(),
                cfg!(target_os = "macos"),
            );
            self.last_disk_refresh = Some(Instant::now());
        }
        let timestamp = timestamp_ms();
        let cpu_usage = finite_usage(self.system.global_cpu_usage());
        push_history(
            &mut self.history,
            Sample {
                timestamp,
                usage: cpu_usage,
            },
        );
        Ok(Snapshot {
            timestamp,
            cpu_usage,
            cpu_brand: self.cpu_brand.clone(),
            cores: self
                .system
                .cpus()
                .iter()
                .map(|cpu| finite_usage(cpu.cpu_usage()))
                .collect(),
            physical_cores: self.physical_cores,
            memory_total: self.system.total_memory(),
            memory_used: self.system.used_memory().min(self.system.total_memory()),
            swap_total: self.system.total_swap(),
            swap_used: self.system.used_swap(),
            disks: self.disk_info.clone(),
            history: self.history.iter().cloned().collect(),
            uptime: System::uptime(),
            os: self.os.clone(),
            host: self.host.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn disk(mount: &str) -> DiskInfo {
        DiskInfo {
            name: "Macintosh HD - Data".into(),
            mount: mount.into(),
            total: 100,
            available: 40,
            removable: false,
            system: false,
        }
    }

    #[test]
    fn macos_prefers_data_and_keeps_external_volumes() {
        let result = normalize_disks(
            vec![
                disk("/"),
                disk("/System/Volumes/Data"),
                disk("/System/Volumes/VM"),
                disk("/Volumes/Backup"),
            ],
            true,
        );
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].mount, "/");
        assert_eq!(result[0].name, "Macintosh HD");
        assert!(result[0].system);
        assert_eq!(result[1].mount, "/Volumes/Backup");
    }

    #[test]
    fn root_fallback_and_windows_mounts_are_preserved() {
        assert_eq!(normalize_disks(vec![disk("/")], true).len(), 1);
        let result = normalize_disks(vec![disk("C:\\"), disk("D:\\"), disk("D:\\")], false);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn invalid_capacities_are_bounded() {
        let mut invalid = disk("E:\\");
        invalid.available = 120;
        assert_eq!(
            normalize_disks(vec![invalid.clone()], false)[0].available,
            100
        );
        invalid.total = 0;
        assert!(normalize_disks(vec![invalid], false).is_empty());
    }

    #[test]
    fn history_bounds_time_and_clears_sleep_or_clock_changes() {
        let mut history = VecDeque::new();
        for i in 0..200 {
            push_history(
                &mut history,
                Sample {
                    timestamp: i * 1000,
                    usage: 20.0,
                },
            );
        }
        assert_eq!(history.len(), 121);
        assert_eq!(history.front().unwrap().timestamp, 79_000);
        push_history(
            &mut history,
            Sample {
                timestamp: 500_000,
                usage: 40.0,
            },
        );
        assert_eq!(history.len(), 1);
        push_history(
            &mut history,
            Sample {
                timestamp: 400_000,
                usage: 40.0,
            },
        );
        assert_eq!(history.len(), 1);
    }
}
