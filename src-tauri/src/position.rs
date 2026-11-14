#[derive(Clone, Copy, Debug)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn panel_position(work: Bounds, tray: Bounds, width: f64, height: f64, gap: f64) -> (f64, f64) {
    let center_x = tray.x + tray.width / 2.0;
    let center_y = tray.y + tray.height / 2.0;
    let x = center_x - width / 2.0;
    let y = if center_y < work.y + work.height / 2.0 {
        tray.y + tray.height + gap
    } else {
        tray.y - height - gap
    };
    let max_x = (work.x + work.width - width - gap).max(work.x + gap);
    let max_y = (work.y + work.height - height - gap).max(work.y + gap);
    (x.clamp(work.x + gap, max_x), y.clamp(work.y + gap, max_y))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mac_top_and_windows_bottom_stay_inside_work_area() {
        let work = Bounds {
            x: 0.0,
            y: 24.0,
            width: 1440.0,
            height: 836.0,
        };
        let top = Bounds {
            x: 1420.0,
            y: 0.0,
            width: 20.0,
            height: 24.0,
        };
        assert_eq!(panel_position(work, top, 400.0, 660.0, 8.0), (1032.0, 32.0));
        let bottom = Bounds {
            x: 1300.0,
            y: 860.0,
            width: 20.0,
            height: 40.0,
        };
        assert_eq!(
            panel_position(work, bottom, 400.0, 660.0, 8.0),
            (1032.0, 192.0)
        );
    }
    #[test]
    fn negative_monitor_origin_and_hidpi_work() {
        let work = Bounds {
            x: -2880.0,
            y: 48.0,
            width: 2880.0,
            height: 1700.0,
        };
        let tray = Bounds {
            x: -80.0,
            y: 0.0,
            width: 40.0,
            height: 48.0,
        };
        assert_eq!(
            panel_position(work, tray, 800.0, 1320.0, 16.0),
            (-816.0, 64.0)
        );
    }
}
